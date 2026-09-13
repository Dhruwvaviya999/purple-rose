import "server-only";

import { prisma } from "@/lib/db/client";
import { otpConfig } from "@/lib/auth/config";
import { generateOtpCode, hashOtpCode } from "@/lib/auth/otp-code";
import { keyedHash, hashesMatch } from "@/lib/auth/secret";
import { resolveOtpProvider } from "@/lib/auth/providers/resolve-provider";
import type { AuthFailureCode } from "@/lib/auth/errors";

/**
 * The OTP challenge lifecycle: issue, rate limit, verify, consume, clean up.
 *
 * All of it lives here rather than in an action or a component, so the rules
 * are enforced in one place no matter which entry point calls them.
 *
 * Every limit is enforced against the database, not process memory. On Vercel
 * each request may reach a different instance, so an in-memory counter would
 * reset constantly and provide no real protection.
 */

export type IssueChallengeResult =
  | {
      ok: true;
      challengeId: string;
      expiresAt: Date;
      resendAvailableAt: Date;
    }
  | { ok: false; code: AuthFailureCode };

export type VerifyChallengeResult =
  | { ok: true; phoneNumber: string }
  | { ok: false; code: AuthFailureCode };

function secondsFromNow(seconds: number): Date {
  return new Date(Date.now() + seconds * 1000);
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

/**
 * Remove stale challenges for one number.
 *
 * Runs opportunistically when a new challenge is issued, which keeps the table
 * bounded without a scheduled worker. The cutoff sits well beyond the
 * rate-limit window on purpose: deleting rows the limiter still needs to count
 * would hand an attacker an easy way to reset their own quota.
 */
async function pruneStaleChallenges(phoneNumber: string): Promise<void> {
  try {
    await prisma.otpChallenge.deleteMany({
      where: {
        phoneNumber,
        createdAt: { lt: hoursAgo(otpConfig.retentionHours) },
      },
    });
  } catch (error) {
    // Housekeeping only: never fail a sign-in because cleanup did not run.
    console.error("OTP cleanup failed.", error);
  }
}

/**
 * Issue a code for a number, subject to the cooldown and the hourly caps.
 *
 * The result is identical whether or not an account exists for the number.
 * Accounts are created at verification time, so this step cannot be used to
 * discover who is registered.
 */
export async function issueOtpChallenge(
  phoneNumber: string,
  requestIp: string | null,
): Promise<IssueChallengeResult> {
  const now = new Date();
  const windowStart = hoursAgo(1);
  const requestIpHash = requestIp ? keyedHash(`ip:${requestIp}`) : null;

  const [mostRecent, phoneCount, ipCount] = await Promise.all([
    prisma.otpChallenge.findFirst({
      where: { phoneNumber },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.otpChallenge.count({
      where: { phoneNumber, createdAt: { gte: windowStart } },
    }),
    requestIpHash
      ? prisma.otpChallenge.count({
          where: { requestIpHash, createdAt: { gte: windowStart } },
        })
      : Promise.resolve(0),
  ]);

  if (mostRecent) {
    const nextAllowedAt = new Date(
      mostRecent.createdAt.getTime() + otpConfig.resendCooldownSeconds * 1000,
    );

    if (nextAllowedAt > now) {
      return { ok: false, code: "RESEND_TOO_SOON" };
    }
  }

  if (
    phoneCount >= otpConfig.maxPerPhonePerHour ||
    ipCount >= otpConfig.maxPerIpPerHour
  ) {
    return { ok: false, code: "TOO_MANY_REQUESTS" };
  }

  const code = generateOtpCode();
  const expiresAt = secondsFromNow(otpConfig.ttlSeconds);

  const challenge = await prisma.otpChallenge.create({
    data: {
      phoneNumber,
      codeHash: hashOtpCode(phoneNumber, code),
      expiresAt,
      maxAttempts: otpConfig.maxAttempts,
      requestIpHash,
    },
    select: { id: true, createdAt: true },
  });

  try {
    await resolveOtpProvider().send({
      phoneNumber,
      code,
      ttlSeconds: otpConfig.ttlSeconds,
    });
  } catch (error) {
    // The row exists but nobody can ever satisfy it, so retire it at once
    // rather than leave a dangling challenge that also counts against the
    // legitimate caller's own rate limit.
    console.error("OTP delivery failed.", error);
    await prisma.otpChallenge
      .delete({ where: { id: challenge.id } })
      .catch(() => undefined);
    return { ok: false, code: "DELIVERY_FAILED" };
  }

  void pruneStaleChallenges(phoneNumber);

  return {
    ok: true,
    challengeId: challenge.id,
    expiresAt,
    resendAvailableAt: new Date(
      challenge.createdAt.getTime() + otpConfig.resendCooldownSeconds * 1000,
    ),
  };
}

/**
 * Check a submitted code against a challenge.
 *
 * On success the challenge is consumed by a conditional update that also
 * asserts it is still unconsumed, so two racing submissions cannot both win
 * and a code can never be replayed.
 */
export async function verifyOtpChallenge(
  challengeId: string,
  submittedCode: string,
): Promise<VerifyChallengeResult> {
  const challenge = await prisma.otpChallenge.findUnique({
    where: { id: challengeId },
    select: {
      id: true,
      phoneNumber: true,
      codeHash: true,
      expiresAt: true,
      attempts: true,
      maxAttempts: true,
      consumedAt: true,
    },
  });

  // A consumed challenge is reported as absent: replaying a used code must
  // look no different from submitting one that never existed.
  if (!challenge || challenge.consumedAt) {
    return { ok: false, code: "CHALLENGE_NOT_FOUND" };
  }

  if (challenge.expiresAt <= new Date()) {
    return { ok: false, code: "CHALLENGE_EXPIRED" };
  }

  if (challenge.attempts >= challenge.maxAttempts) {
    return { ok: false, code: "TOO_MANY_ATTEMPTS" };
  }

  const submittedHash = hashOtpCode(challenge.phoneNumber, submittedCode);

  if (!hashesMatch(submittedHash, challenge.codeHash)) {
    const { attempts } = await prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    });

    return {
      ok: false,
      code:
        attempts >= challenge.maxAttempts
          ? "TOO_MANY_ATTEMPTS"
          : "CODE_INCORRECT",
    };
  }

  const consumed = await prisma.otpChallenge.updateMany({
    where: { id: challenge.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  if (consumed.count === 0) {
    return { ok: false, code: "CHALLENGE_NOT_FOUND" };
  }

  return { ok: true, phoneNumber: challenge.phoneNumber };
}

/**
 * Delete every challenge past its retention window, for every number.
 *
 * Not called during a request. It exists so a scheduled job can be pointed at
 * it later without anything being rewritten.
 */
export async function deleteExpiredOtpChallenges(): Promise<number> {
  const { count } = await prisma.otpChallenge.deleteMany({
    where: { createdAt: { lt: hoursAgo(otpConfig.retentionHours) } },
  });

  return count;
}
