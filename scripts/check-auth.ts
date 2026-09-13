/**
 * Offline checks for the authentication logic that does not touch the database.
 *
 * Run with `pnpm check:auth`. Covers the parts where a mistake is silent and
 * expensive: phone normalisation (which is what stops one person becoming two
 * accounts), open-redirect refusal, code randomness, keyed hashing and the
 * input schemas.
 *
 * Database-backed behaviour -- expiry, attempt limits, cooldowns, replay,
 * sessions -- is covered by `pnpm check:auth:db`, which needs a connection.
 *
 * The `--conditions=react-server` flag in the package script is what lets Node
 * import the modules marked `server-only`.
 */
// A throwaway key: these checks only assert that hashing is consistent and
// keyed, never that any particular digest value is correct.
process.env.AUTH_SECRET ??= "check-only-secret-value-at-least-32-characters";

import { normalisePhoneNumber } from "../src/lib/auth/phone";
import { safeRedirectPath, defaultDestinationForRole } from "../src/lib/auth/redirect";
import { generateOtpCode, hashOtpCode } from "../src/lib/auth/otp-code";
import { hashesMatch } from "../src/lib/auth/secret";
import { otpCodeSchema, phoneInputSchema } from "../src/lib/validations/auth";

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

console.log("\n== phone normalisation ==");
const indianVariants = [
  "+919876543210",
  "+91 98765 43210",
  "09876543210",
  "9876543210",
  "+91-98765-43210",
  " (+91) 98765 43210 ",
];
const normalised = indianVariants.map((v) => normalisePhoneNumber(v)?.e164);
check(
  "every Indian format collapses to one E.164 value",
  new Set(normalised).size === 1 && normalised[0] === "+919876543210",
  JSON.stringify(normalised),
);

const uk = normalisePhoneNumber("+442071838750");
check("a non-Indian number is accepted", uk?.e164 === "+442071838750", String(uk?.e164));

const us = normalisePhoneNumber("+12125550123");
check("a US number keeps its own country code", us?.e164 === "+12125550123", String(us?.e164));

for (const bad of ["", "   ", "abc", "12", "+9999999999999999999", "0000000000"]) {
  check(`rejects ${JSON.stringify(bad)}`, normalisePhoneNumber(bad) === null);
}

const masked = normalisePhoneNumber("+919876543210")?.masked ?? "";
check("masked form hides the middle digits", !masked.includes("98765") && masked.endsWith("3210"), masked);
check("E.164 never exceeds the 16-char column", (normalised[0] ?? "").length <= 16);

console.log("\n== open redirect protection ==");
const hostileTargets = [
  "//evil.example.com",
  "https://evil.example.com",
  "http://evil.example.com",
  "/\\evil.example.com",
  "\\\\evil.example.com",
  "javascript:alert(1)",
  "/%2f%2fevil.example.com",
  "//evil.example.com/admin",
  "/admin\\@evil.example.com",
];
for (const target of hostileTargets) {
  check(`refuses ${JSON.stringify(target)}`, safeRedirectPath(target) === null, String(safeRedirectPath(target)));
}
check("refuses an unlisted internal path", safeRedirectPath("/secret-area") === null);
check("allows /admin", safeRedirectPath("/admin") === "/admin");
check("allows a nested admin path", safeRedirectPath("/admin/orders") === "/admin/orders");
check("allows /shop", safeRedirectPath("/shop") === "/shop");
check("refuses null and undefined", safeRedirectPath(null) === null && safeRedirectPath(undefined) === null);
check("admin default destination", defaultDestinationForRole("ADMIN") === "/admin");
check("customer default destination", defaultDestinationForRole("CUSTOMER") === "/");

console.log("\n== otp code generation ==");
const codes = Array.from({ length: 3000 }, () => generateOtpCode());
check("every code is exactly six digits", codes.every((c) => /^\d{6}$/.test(c)));
check("codes are not constant", new Set(codes).size > 2500, `${new Set(codes).size} distinct`);
check("leading-zero codes are reachable", codes.some((c) => c.startsWith("0")));

console.log("\n== otp hashing ==");
const phone = "+919876543210";
const code = "123456";
const digest = hashOtpCode(phone, code);
check("digest is 64 hex chars (sha256)", /^[0-9a-f]{64}$/.test(digest));
check("digest does not contain the code", !digest.includes(code));
check("same input gives same digest", hashOtpCode(phone, code) === digest);
check("a different code gives a different digest", hashOtpCode(phone, "123457") !== digest);
check(
  "the same code for another number gives a different digest",
  hashOtpCode("+919876543211", code) !== digest,
);
check("matching digests compare equal", hashesMatch(digest, hashOtpCode(phone, code)));
check("different digests compare unequal", !hashesMatch(digest, hashOtpCode(phone, "999999")));
check("malformed digest does not throw", hashesMatch(digest, "") === false);
check("short digest does not throw", hashesMatch(digest, "ab") === false);

console.log("\n== input schemas ==");
check("accepts a pasted spaced code", otpCodeSchema.safeParse("123 456").success);
check("normalises a spaced code", otpCodeSchema.safeParse("123 456").data === "123456");
check("rejects a five-digit code", !otpCodeSchema.safeParse("12345").success);
check("rejects a seven-digit code", !otpCodeSchema.safeParse("1234567").success);
check("rejects letters in a code", !otpCodeSchema.safeParse("12345a").success);
check("accepts a plausible phone string", phoneInputSchema.safeParse("+91 98765 43210").success);
check("rejects an over-long phone string", !phoneInputSchema.safeParse("+9".repeat(40)).success);
check("rejects a phone string with letters", !phoneInputSchema.safeParse("+91abcdefgh").success);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exitCode = failed === 0 ? 0 : 1;
