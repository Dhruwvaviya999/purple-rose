/**
 * The session cookie name, defined once.
 *
 * Kept in its own module, free of `server-only`, because it is needed both by
 * the server-side session code and by `proxy.ts`, which runs in a separate,
 * lighter runtime. Two copies of this string that could drift apart would be a
 * silent way to lock everybody out.
 *
 * The name is only an identifier. It reveals nothing and carries no value.
 */
export const SESSION_COOKIE_NAME = "pr_session";
