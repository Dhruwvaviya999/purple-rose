import "server-only";

import type { OtpDeliveryProvider } from "./types";

/**
 * Development delivery: the code is written to the server log.
 *
 * This exists so the whole authentication flow can be exercised before an SMS
 * account exists. It is NOT a fallback for production.
 *
 * The code goes to the server's standard output only. It is never returned in
 * a response, never sent to the browser, and never rendered. A developer reads
 * it from the terminal running `pnpm dev`.
 *
 * `send` refuses to run when NODE_ENV is production. That is deliberate: a
 * misconfigured deployment must fail loudly rather than quietly write customer
 * login codes into a production log aggregator, where anyone with log access
 * could sign in as anyone.
 */
export const consoleOtpProvider: OtpDeliveryProvider = {
  name: "console",

  async send({ phoneNumber, code, ttlSeconds }) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "The console OTP provider is disabled in production. Configure a real " +
          "SMS provider and set AUTH_OTP_TRANSPORT before serving live traffic.",
      );
    }

    const minutes = Math.round(ttlSeconds / 60);

    console.info(
      [
        "",
        "  ┌─────────────────────────────────────────────┐",
        "  │  Purple Rose — development sign-in code      │",
        `  │  to:    ${phoneNumber.padEnd(35)}│`,
        `  │  code:  ${code.padEnd(35)}│`,
        `  │  valid: ${`${minutes} minutes`.padEnd(35)}│`,
        "  └─────────────────────────────────────────────┘",
        "",
      ].join("\n"),
    );
  },
};
