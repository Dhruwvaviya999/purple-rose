/**
 * End-to-end checks for the authentication flows that need a database.
 *
 * Run with `pnpm check:auth:db`. It needs `DATABASE_URL` and `AUTH_SECRET` in
 * `.env.local`, and the migrations applied. Without a connection it exits
 * cleanly and says what is missing, rather than pretending to have passed.
 *
 * It works against the real services, not mocks, so what it proves is what the
 * application actually does. Every record it creates uses a reserved
 * test-number range and is deleted afterwards, including on failure.
 *
 * Covered here: new customer sign-in, returning customer with no duplicate
 * account, administrator keeping ADMIN, wrong codes incrementing attempts,
 * lockout, replay refusal, expiry, resend cooldown, hourly cap, and session
 * creation, lookup, revocation and expiry.
 */
import { config as loadEnvFiles } from "dotenv";

loadEnvFiles({ path: [".env.local", ".env"], quiet: true });

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { Role } from "../src/generated/prisma/enums";

/**
 * +1 555 01xx is reserved for fiction, so these numbers cannot belong to a
 * real person. They are still normalised through the same code path the
 * application uses.
 */
const TEST_NUMBERS = {
  newCustomer: "+15550100001",
  returning: "+15550100002",
  admin: "+15550100003",
  limits: "+15550100004",
  expiry: "+15550100005",
} as const;

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` -- ${detail}` : ""}`);
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const authSecret = process.env.AUTH_SECRET?.trim();

  if (!databaseUrl || !authSecret) {
    console.log(
      [
        "",
        "  Skipped: the database-backed checks need a live database.",
        "",
        `    DATABASE_URL  ${databaseUrl ? "set" : "MISSING"}`,
        `    AUTH_SECRET   ${authSecret ? "set" : "MISSING"}`,
        "",
        "  Set both in .env.local, run `pnpm db:migrate`, then re-run this.",
        "",
      ].join("\n"),
    );
    return;
  }

  // Imported here, after the environment is confirmed, so a missing variable
  // is reported as the message above rather than a module-load crash.
  const { issueOtpChallenge, verifyOtpChallenge } = await import(
    "../src/lib/services/otp-service"
  );
  const { findOrCreateUserByPhone } = await import(
    "../src/lib/services/user-service"
  );
  const sessions = await import("../src/lib/services/session-service");
  const { otpConfig } = await import("../src/lib/auth/config");
  const { hashOtpCode } = await import("../src/lib/auth/otp-code");

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  /**
   * Read back the code by matching its digest.
   *
   * The plaintext is never stored, so this brute-forces the six-digit space
   * against the keyed hash. That is only possible here because this script
   * holds AUTH_SECRET; it is exactly the work an attacker cannot do with the
   * database alone, which is the point of keying the hash.
   */
  async function readCode(challengeId: string): Promise<string> {
    const row = await prisma.otpChallenge.findUniqueOrThrow({
      where: { id: challengeId },
      select: { phoneNumber: true, codeHash: true },
    });

    for (let n = 0; n < 1_000_000; n += 1) {
      const candidate = String(n).padStart(6, "0");
      if (hashOtpCode(row.phoneNumber, candidate) === row.codeHash) {
        return candidate;
      }
    }

    throw new Error("Could not recover the code for the challenge.");
  }

  async function cleanup(): Promise<void> {
    const numbers = Object.values(TEST_NUMBERS);
    await prisma.otpChallenge.deleteMany({
      where: { phoneNumber: { in: numbers } },
    });
    // Sessions go with the user rows through the cascade.
    await prisma.user.deleteMany({ where: { phoneNumber: { in: numbers } } });
  }

  try {
    await cleanup();

    console.log("\n== new customer signs in ==");
    {
      const issued = await issueOtpChallenge(TEST_NUMBERS.newCustomer, null);
      check("a challenge is issued", issued.ok);
      if (!issued.ok) throw new Error("cannot continue without a challenge");

      const stored = await prisma.otpChallenge.findUniqueOrThrow({
        where: { id: issued.challengeId },
        select: { codeHash: true },
      });
      const code = await readCode(issued.challengeId);

      check("the plaintext code is not stored", !stored.codeHash.includes(code));
      check(
        "no account exists before verification",
        (await prisma.user.count({
          where: { phoneNumber: TEST_NUMBERS.newCustomer },
        })) === 0,
      );

      const verified = await verifyOtpChallenge(issued.challengeId, code);
      check("the correct code verifies", verified.ok);

      const user = await findOrCreateUserByPhone(TEST_NUMBERS.newCustomer);
      check("an account is created", Boolean(user.id));
      check("the new account is a CUSTOMER", user.role === Role.CUSTOMER);

      const session = await sessions.createSession(user.id);
      const resolved = await sessions.findSessionUser(session.token);
      check("the session resolves to the user", resolved?.id === user.id);

      const row = await prisma.session.findFirstOrThrow({
        where: { userId: user.id },
        select: { tokenHash: true },
      });
      check(
        "the raw session token is not stored",
        row.tokenHash !== session.token,
      );

      await sessions.revokeSession(session.token);
      check(
        "a revoked session stops resolving",
        (await sessions.findSessionUser(session.token)) === null,
      );

      check(
        "a used code cannot be replayed",
        !(await verifyOtpChallenge(issued.challengeId, code)).ok,
      );
    }

    console.log("\n== returning customer ==");
    {
      const first = await findOrCreateUserByPhone(TEST_NUMBERS.returning);
      const again = await findOrCreateUserByPhone(TEST_NUMBERS.returning);
      check("the same account is returned", first.id === again.id);
      check(
        "no duplicate account is created",
        (await prisma.user.count({
          where: { phoneNumber: TEST_NUMBERS.returning },
        })) === 1,
      );
    }

    console.log("\n== administrator keeps ADMIN ==");
    {
      await prisma.user.create({
        data: { phoneNumber: TEST_NUMBERS.admin, role: Role.ADMIN },
      });

      const signedIn = await findOrCreateUserByPhone(TEST_NUMBERS.admin);
      check("signing in does not demote an administrator", signedIn.role === Role.ADMIN);

      const issued = await issueOtpChallenge(TEST_NUMBERS.admin, null);
      if (issued.ok) {
        const code = await readCode(issued.challengeId);
        const verified = await verifyOtpChallenge(issued.challengeId, code);
        const after = verified.ok
          ? await findOrCreateUserByPhone(verified.phoneNumber)
          : null;
        check("role survives a full sign-in", after?.role === Role.ADMIN);
      } else {
        check("role survives a full sign-in", false, "challenge was refused");
      }
    }

    console.log("\n== wrong codes, lockout and expiry ==");
    {
      const issued = await issueOtpChallenge(TEST_NUMBERS.limits, null);
      if (!issued.ok) throw new Error("cannot continue without a challenge");

      const realCode = await readCode(issued.challengeId);
      const wrongCode = realCode === "000000" ? "111111" : "000000";

      const firstWrong = await verifyOtpChallenge(issued.challengeId, wrongCode);
      check(
        "a wrong code is refused",
        !firstWrong.ok && firstWrong.code === "CODE_INCORRECT",
      );
      check(
        "a wrong code increments attempts",
        (
          await prisma.otpChallenge.findUniqueOrThrow({
            where: { id: issued.challengeId },
            select: { attempts: true },
          })
        ).attempts === 1,
      );

      // Burn the rest of the allowance.
      for (let i = 1; i < otpConfig.maxAttempts; i += 1) {
        await verifyOtpChallenge(issued.challengeId, wrongCode);
      }

      const lockedOut = await verifyOtpChallenge(issued.challengeId, realCode);
      check(
        "the correct code is refused once attempts run out",
        !lockedOut.ok && lockedOut.code === "TOO_MANY_ATTEMPTS",
      );

      const unknown = await verifyOtpChallenge(
        "00000000-0000-7000-8000-000000000000",
        realCode,
      );
      check(
        "an unknown challenge is refused",
        !unknown.ok && unknown.code === "CHALLENGE_NOT_FOUND",
      );
    }

    console.log("\n== expiry ==");
    {
      const issued = await issueOtpChallenge(TEST_NUMBERS.expiry, null);
      if (!issued.ok) throw new Error("cannot continue without a challenge");

      const code = await readCode(issued.challengeId);

      // Age the challenge rather than waiting out its lifetime.
      await prisma.otpChallenge.update({
        where: { id: issued.challengeId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const expired = await verifyOtpChallenge(issued.challengeId, code);
      check(
        "an expired code is refused",
        !expired.ok && expired.code === "CHALLENGE_EXPIRED",
      );
    }

    console.log("\n== resend cooldown and hourly cap ==");
    {
      const tooSoon = await issueOtpChallenge(TEST_NUMBERS.expiry, null);
      check(
        "a second code straight away is refused",
        !tooSoon.ok && tooSoon.code === "RESEND_TOO_SOON",
      );

      // Move the existing challenges out of the cooldown but inside the
      // one-hour counting window, then fill the quota.
      const outsideCooldown = new Date(
        Date.now() - (otpConfig.resendCooldownSeconds + 5) * 1000,
      );
      await prisma.otpChallenge.updateMany({
        where: { phoneNumber: TEST_NUMBERS.expiry },
        data: { createdAt: outsideCooldown },
      });

      let refusal: string | null = null;
      for (let i = 0; i < otpConfig.maxPerPhonePerHour + 2; i += 1) {
        const result = await issueOtpChallenge(TEST_NUMBERS.expiry, null);
        if (!result.ok) {
          refusal = result.code;
          break;
        }
        await prisma.otpChallenge.updateMany({
          where: { phoneNumber: TEST_NUMBERS.expiry },
          data: { createdAt: outsideCooldown },
        });
      }

      check(
        "the hourly cap eventually refuses a request",
        refusal === "TOO_MANY_REQUESTS",
        String(refusal),
      );
    }

    console.log("\n== session expiry ==");
    {
      const user = await findOrCreateUserByPhone(TEST_NUMBERS.returning);
      const session = await sessions.createSession(user.id);

      await prisma.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      check(
        "an expired session stops resolving",
        (await sessions.findSessionUser(session.token)) === null,
      );
      check(
        "an unknown token resolves to nobody",
        (await sessions.findSessionUser("not-a-real-token")) === null,
      );

      const revoked = await sessions.revokeAllSessionsForUser(user.id);
      check("bulk revocation reports a count", revoked >= 0);
    }
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((error: unknown) => {
  console.error(
    `Checks failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
