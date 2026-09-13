/**
 * Contract every OTP delivery mechanism implements.
 *
 * Authentication depends on this interface and never on a vendor SDK, so
 * adding a real SMS provider later is a new file plus one line in
 * `resolve-provider.ts`, with no change to the OTP service or the UI.
 */
export type OtpDeliveryRequest = {
  /** Canonical E.164 destination. */
  phoneNumber: string;
  /** Plaintext code. Must never be persisted or returned to a browser. */
  code: string;
  /** How long the code remains valid, for the message wording. */
  ttlSeconds: number;
};

export type OtpDeliveryProvider = {
  /** Stable identifier, used in logs and configuration. */
  readonly name: string;
  /** Deliver the code, or throw. A throw is reported to the user as a
   *  generic failure and logged in full on the server. */
  send(request: OtpDeliveryRequest): Promise<void>;
};
