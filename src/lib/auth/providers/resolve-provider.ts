import "server-only";

import { consoleOtpProvider } from "./console-provider";
import type { OtpDeliveryProvider } from "./types";

/**
 * Pick the delivery provider for this environment.
 *
 * `AUTH_OTP_TRANSPORT=console` is the only implemented transport today. When a
 * real provider is added it registers here, and nothing else changes.
 */
export function resolveOtpProvider(): OtpDeliveryProvider {
  const transport = process.env.AUTH_OTP_TRANSPORT?.trim() || "console";

  switch (transport) {
    case "console":
      return consoleOtpProvider;
    default:
      throw new Error(
        `Unknown AUTH_OTP_TRANSPORT "${transport}". ` +
          `The only implemented transport is "console".`,
      );
  }
}
