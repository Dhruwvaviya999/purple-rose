# Purple Rose authentication

How signing in works, and why it is built this way. Written for engineers
joining the repository.

Purple Rose has **no passwords**. A person proves they hold a phone number by
entering a one-time code sent to it. That is the only way in, for customers and
administrators alike.

> Development delivery writes codes to the server log and refuses to run in
> production. Read [Development OTP](#development-otp) before assuming anything
> here is ready for live traffic.

---

## Why this architecture

The requirement is phone number plus one-time code. Three options were
weighed.

**Auth.js (NextAuth) — rejected.** It has no native phone OTP provider, so the
flow would have to be forced through the Credentials provider. That provider
only supports JWT sessions, which cannot be revoked server-side: a logout would
clear a cookie while the token itself stayed valid until it expired. Session
revocation is a hard requirement for a store that will hold addresses and order
history, so the mismatch is architectural rather than cosmetic. We would also
inherit an adapter schema of `Account`, `Session` and `VerificationToken`
tables shaped for OAuth, colliding with the `User` model and the UUIDv7 strategy
Phase 2 settled.

**better-auth — rejected, but closer.** It does have a phone-number plugin and
is actively maintained. It also brings its own schema and its own opinions about
identity, which would mean reshaping a `User` table that already exists and is
already correct for us. The cost is real and the benefit, for one flow with no
OAuth and no passwords, is small.

**Next.js server primitives — chosen.** The whole flow is a code, a record, and
a cookie. Sessions are database rows and the session token is an opaque random
string, which is the simplest thing that supports revocation, multiple devices
and expiry. Hashing uses Node's `crypto`; no library is added for it. Nothing
is invented that a framework would have given us, and nothing is bent to fit a
model built for a different problem.

What we deliberately did not hand-roll: CSRF protection and endpoint exposure,
both of which come from using Server Actions.

---

## The pieces

```
src/
├── proxy.ts                              optimistic request guard (Next 16)
├── actions/auth.ts                       the only two auth endpoints
├── features/auth/
│   ├── login-state.ts                    shared form state shape
│   └── components/                       login form, OTP input, sign out
├── lib/auth/
│   ├── config.ts                         tunables, read from the environment
│   ├── cookie.ts                         the cookie name, defined once
│   ├── secret.ts                         keyed hashing, timing-safe compare
│   ├── otp-code.ts                       code generation and hashing
│   ├── phone.ts                          E.164 normalisation
│   ├── session.ts                        the session cookie
│   ├── current-user.ts                   getCurrentUser / requireUser / requireAdmin
│   ├── redirect.ts                       open-redirect refusal
│   ├── errors.ts                         every user-visible message
│   └── providers/                        delivery provider interface
└── lib/services/
    ├── otp-service.ts                    challenge lifecycle and rate limits
    ├── session-service.ts                session records
    └── user-service.ts                   account lookup and creation
```

The layering from Phase 2 holds: a route file composes, a service talks to the
database, and no component contains authentication logic.

---

## Transport: Server Actions, not Route Handlers

Both entry points are Server Actions. There is no `/api/auth/*`.

This is a security decision, not a style one:

- **CSRF.** Next.js compares the request `Origin` against the `Host` on every
  Server Action and rejects a mismatch. A Route Handler gets none of that, so
  choosing one would mean writing and maintaining token-based CSRF protection
  for a `POST` that sets a session cookie. Being a `POST` protects nothing by
  itself.
- **No public surface.** Action ids are encrypted at build time and unused
  actions are stripped, so there is no stable URL to script against.
- **No second implementation.** Nothing outside this application needs to sign
  in, so a public API would be a second code path to keep in step.

Only `loginAction` and `logoutAction` are exported from
`src/actions/auth.ts`. Every export in a `"use server"` file becomes a callable
endpoint, so the stage handlers stay private, and the file exports no constants
(Next rejects non-function exports there, which is why `login-state.ts` exists).

---

## Phone normalisation

Every number is reduced to one canonical E.164 string before it touches the
database.

```
"+91 98765 43210"  ─┐
"09876543210"       ├──►  "+919876543210"
"9876543210"        │
"+91-98765-43210"  ─┘
```

Without this the unique constraint on `User.phoneNumber` is worthless: one
person typing their number two ways becomes two accounts, each with its own
orders. `libphonenumber-js` does the work because the rules are genuinely per
country. Knowing that a leading zero is a trunk prefix to drop in India but
significant elsewhere is not something a regular expression can decide.

`AUTH_DEFAULT_COUNTRY` (default `IN`) only decides how to read an input that
carries no country code. A number with a country code is honoured as given, so
the service is international; only the fallback is regional.

The seed uses the same function, so a seeded administrator matches the account
their sign-in produces. Storing a raw value there would create a row no
sign-in could ever reach.

There is no database `CHECK` constraint on format. Prisma cannot express one,
so it would be hand-written SQL the schema does not know about, which then
reports as drift on every migration.

---

## OTP lifecycle

```
1. Enter number        ──►  normalise to E.164
2. Rate limits         ──►  cooldown, per-number cap, per-address cap
3. Generate            ──►  6 digits from crypto.randomInt
4. Store               ──►  HMAC of the code; plaintext is never persisted
5. Deliver             ──►  provider.send(); on failure the row is deleted
6. Enter code          ──►  challenge id + code
7. Verify              ──►  exists? unconsumed? unexpired? attempts left? match?
8. Consume             ──►  conditional update; the code cannot be reused
9. Account             ──►  find by number, or create a CUSTOMER
10. Session            ──►  row created, opaque token set as a cookie
11. Redirect           ──►  validated path, or the role's default
```

A failure at any step returns one of the fixed messages in
`src/lib/auth/errors.ts`. Nothing downstream improvises wording.

### Why codes are hashed with a key

A six-digit code carries about twenty bits of entropy. An unkeyed SHA-256 of
one is effectively reversible: anyone holding the database can hash all one
million possibilities in moments and read every pending code.

So the stored digest is `HMAC-SHA256(AUTH_SECRET, "otp:" + phone + ":" + code)`.
The key lives in the environment, not the database, so a database leak alone
does not yield a single code.

The phone number is mixed in so a digest is only meaningful for the number it
was issued to and cannot be transplanted onto another challenge.

Comparison uses `timingSafeEqual`, so a wrong guess takes the same time whether
it was wrong in the first digit or the last.

Note the asymmetry with session tokens, which are hashed with a **plain**
SHA-256. That is deliberate: a session token is 256 random bits and cannot be
brute forced from its hash, so keying would add nothing.

> Hashing is not what makes a six-digit code safe. Short expiry, attempt
> limits, one-time consumption and request throttling are. Hashing only limits
> the damage if the database is read.

### Verification rules

| Condition                   | Result                | Effect                     |
| --------------------------- | --------------------- | -------------------------- |
| Challenge missing           | `CHALLENGE_NOT_FOUND` | none                       |
| Already consumed            | `CHALLENGE_NOT_FOUND` | replay refused             |
| Past `expiresAt`            | `CHALLENGE_EXPIRED`   | none                       |
| Attempts at the ceiling     | `TOO_MANY_ATTEMPTS`   | none                       |
| Code wrong                  | `CODE_INCORRECT`      | attempts incremented       |
| Code wrong, ceiling reached | `TOO_MANY_ATTEMPTS`   | challenge burned           |
| Code right                  | signed in             | consumed, session created  |

A consumed challenge reports as *not found* rather than *already used*, so
replaying a code looks identical to inventing one.

`maxAttempts` is stored on the row, fixed when the challenge is created, so
changing the limit never affects codes already in flight.

Consumption is a conditional update that also asserts the row is still
unconsumed, so two racing submissions cannot both succeed.

---

## Rate limiting

Every limit is counted **in the database**, not in process memory.

| Limit                | Default | Variable                            |
| -------------------- | ------- | ----------------------------------- |
| Code lifetime        | 5 min   | `AUTH_OTP_TTL_SECONDS`              |
| Wrong guesses        | 5       | `AUTH_OTP_MAX_ATTEMPTS`             |
| Resend cooldown      | 60 s    | `AUTH_OTP_RESEND_COOLDOWN_SECONDS`  |
| Codes per number/hr  | 5       | `AUTH_OTP_MAX_PER_PHONE_PER_HOUR`   |
| Codes per address/hr | 20      | `AUTH_OTP_MAX_PER_IP_PER_HOUR`      |

This matters on Vercel. Each request may reach a different instance, so an
in-memory counter would reset constantly and provide no real protection. The
limits here are derived by counting rows in `OtpChallenge`, so they hold across
every instance. **There is no in-memory limiter in this codebase**, and none
should be added.

The countdown in the UI is presentation only. Re-enabling the button in a
browser changes nothing: the cooldown is enforced server-side.

The per-address limit hashes the address with `AUTH_SECRET` rather than storing
it, so the column cannot be read back as location data. The address comes from
`x-forwarded-for`, which is client-controlled in general, so it is treated as a
hint that makes bulk abuse more expensive and never as identity.

### Cleanup

Challenges older than 24 hours are deleted opportunistically whenever a new one
is issued for that number. That keeps the table bounded with no worker process
and no timer, which suits a serverless deployment where neither survives.

The 24-hour cutoff is deliberately far beyond the one-hour rate window:
deleting rows the limiter still needs to count would hand an attacker a way to
reset their own quota.

`deleteExpiredOtpChallenges()` and `deleteExpiredSessions()` exist for a
scheduled job later. Nothing calls them during a request.

---

## Sessions

A session is a database row. The browser holds an opaque token; the database
stores only its SHA-256 digest.

```
browser cookie:  pr_session = <32 random bytes, base64url>
database row:    tokenHash  = sha256(token), userId, expiresAt, revokedAt
```

The cookie carries **no claims**. No user id, no role, no phone number, nothing
signed. There is nothing in it to read or tamper with, and every request
resolves the token against the database, so a role change or a revocation takes
effect on the very next request.

Reading the `Session` table does not yield a usable session, because the raw
token is never stored.

### Cookie configuration

| Attribute  | Value                    | Why                                                   |
| ---------- | ------------------------ | ----------------------------------------------------- |
| `HttpOnly` | yes                      | JavaScript cannot read it, so XSS cannot steal it     |
| `Secure`   | production only          | never sent over plain HTTP; off locally for `http://` |
| `SameSite` | `lax`                    | survives the post-sign-in redirect, withheld from cross-site posts |
| `Path`     | `/`                      | the whole application                                 |
| `Expires`  | 30 days                  | matches the database row                              |

The token never appears in a URL, so it cannot leak through a `Referer` header,
a server access log, or a shared link.

### Lifetime

Thirty days by default (`AUTH_SESSION_TTL_DAYS`), as an **absolute** expiry.
It is not extended on use.

That is a deliberate trade-off. Sliding renewal would mean a database write on
every request, which is expensive per serverless invocation, and a cookie can
only be rewritten from a Server Action or Route Handler, never from the Server
Component that reads it. A fixed window is simpler and predictable. Sliding
renewal is a reasonable future refinement; it is not a gap that matters today.

Expiry and revocation are part of the lookup, not a later check, so there is no
window in which a dead session resolves to a user.

`revokeAllSessionsForUser()` exists for the moment an account is compromised.
It is not reachable from the UI yet, and account-level revocation is the whole
reason sessions are rows rather than tokens.

---

## Authorization

Authentication asks who this is. Authorization asks what they may do. They are
separate functions so a page that merely greets someone does not accidentally
become a security boundary.

```ts
import { getCurrentUser, requireUser, requireAdmin } from "@/lib/auth/current-user";

const user = await getCurrentUser();   // SessionUser | null
const user = await requireUser("/x");  // redirects to /login?next=/x
const admin = await requireAdmin("/x");// redirects; customers go to /
```

All three run on the server. `getCurrentUser` is wrapped in React's `cache`, so
a layout, a page and a component in one render share a single lookup.

A signed-in customer hitting an admin route is sent to the storefront, not to
sign-in: they are authenticated, so asking them to authenticate again would
loop and would blame their session for what is really a permissions decision.

Roles are `CUSTOMER` and `ADMIN`, a native PostgreSQL enum.

### The role can never come from a request

`findOrCreateUserByPhone` sets `role: Role.CUSTOMER` from a constant when
creating an account, and leaves `role` untouched for an existing one. No form
field, query parameter, header or cookie is consulted. There is no code path in
which a public sign-in produces an administrator, and an administrator signing
in normally keeps the role.

### Creating an administrator

The only sanctioned route is the Phase 2 seed:

```bash
# .env.local
SEED_ADMIN_PHONE_NUMBER="+919876543210"

pnpm db:seed
```

It upserts that number with `role = ADMIN`, normalising it exactly as sign-in
does. That person then signs in through the ordinary flow and keeps ADMIN.

There is no "make me admin" endpoint, and adding one would defeat the model.
The alternative is a direct database change by someone who already has
production credentials.

---

## Protecting the admin area

Four independent layers, because any one of them can be bypassed or forgotten.

1. **`src/proxy.ts`** redirects requests to `/admin*` that carry no session
   cookie. Next.js 16 renamed Middleware to Proxy; this file is the current
   convention and replaces `middleware.ts`.
2. **`src/app/admin/layout.tsx`** calls `requireAdmin()`.
3. **`src/app/admin/page.tsx`** calls `requireAdmin()` as well.
4. **The UI** only shows the admin link to administrators.

The proxy is **not** the security boundary, and must never become one. It runs
on every matched request including prefetches, so it only checks that a cookie
exists. It never opens a database connection and has no idea whose cookie it
is. A forged or expired cookie walks straight past it and is stopped by the
layout.

Layer 3 is not redundant. A layout and the page beneath it render
concurrently, so a layout that throws does not reliably prevent the page from
producing output, and that output can reach the client in the streamed payload.
This was verified: before the page had its own check, admin markup appeared in
the response body of a failed request.

**The rule for future admin work:** every admin page makes its own check, and
every admin query is guarded where the data is read. Layer 4 is cosmetic.
Hiding a link is not security.

---

## Development OTP

No SMS provider is integrated. Codes are delivered by
`src/lib/auth/providers/console-provider.ts`, which writes them to the server
log:

```
  ┌─────────────────────────────────────────────┐
  │  Purple Rose — development sign-in code      │
  │  to:    +919876543210                        │
  │  code:  418302                               │
  │  valid: 5 minutes                            │
  └─────────────────────────────────────────────┘
```

Read it from the terminal running `pnpm dev`.

What this is **not**:

- The code is never returned in a response, never sent to the browser, never
  rendered on a page, and never put in a header.
- There is no universal code. Every code is generated by `crypto.randomInt`,
  in development exactly as in production. A fixed `123456` would be a backdoor
  one environment variable away from production.
- `send()` **throws when `NODE_ENV` is production.** A misconfigured deployment
  fails loudly rather than quietly writing customer sign-in codes into a
  production log aggregator, where anyone with log access could sign in as
  anyone. This is the guardrail that makes it impossible to mistake development
  delivery for a working production setup.

The user-facing result of that throw is the generic "we could not send a code
right now"; the operator sees the real reason in the log.

### Adding a real provider

The flow depends on the `OtpDeliveryProvider` interface, never on a vendor SDK:

```ts
export type OtpDeliveryProvider = {
  readonly name: string;
  send(request: OtpDeliveryRequest): Promise<void>;
};
```

To add one:

1. Write `src/lib/auth/providers/<vendor>-provider.ts` implementing the
   interface. Throw on failure; the caller turns that into a safe message and
   deletes the challenge.
2. Register it in `resolve-provider.ts` under a new `AUTH_OTP_TRANSPORT` value.
3. Add its credentials to `.env.example` as server-only variables.
4. Set `AUTH_OTP_TRANSPORT` in the deployment.

Nothing in the OTP service, the actions or the UI changes. Do not import a
vendor SDK anywhere else.

---

## Environment variables

| Variable | Required | Default | Purpose |
| -------- | -------- | ------- | ------- |
| `AUTH_SECRET` | **yes** | none | Key for hashing codes and addresses. At least 32 characters. `openssl rand -base64 32` |
| `AUTH_OTP_TRANSPORT` | no | `console` | Delivery mechanism |
| `AUTH_DEFAULT_COUNTRY` | no | `IN` | Region assumed for a number with no country code |
| `AUTH_OTP_TTL_SECONDS` | no | `300` | Code lifetime |
| `AUTH_OTP_MAX_ATTEMPTS` | no | `5` | Wrong guesses per code |
| `AUTH_OTP_RESEND_COOLDOWN_SECONDS` | no | `60` | Gap between codes |
| `AUTH_OTP_MAX_PER_PHONE_PER_HOUR` | no | `5` | Codes per number per hour |
| `AUTH_OTP_MAX_PER_IP_PER_HOUR` | no | `20` | Codes per address per hour |
| `AUTH_SESSION_TTL_DAYS` | no | `30` | Session lifetime |
| `SEED_ADMIN_PHONE_NUMBER` | no | none | Number the seed promotes to ADMIN |

Every numeric value is range-checked; an out-of-range value logs a warning and
falls back to the default rather than producing, say, a one-second session.

`AUTH_SECRET` is read lazily, so importing the module never throws and the
build does not need it. Rotating it invalidates codes currently in flight,
which is harmless: users request a new one. It does **not** invalidate
sessions, which are hashed without a key.

None of these carry `NEXT_PUBLIC_`. None may.

---

## Verifying it works

```bash
pnpm check:auth       # no database needed
pnpm check:auth:db    # needs DATABASE_URL and AUTH_SECRET
```

`check:auth` covers the pure logic where a mistake is silent and expensive:
that every phone format collapses to one E.164 value, that hostile redirect
targets are refused, that codes are random and six digits, that hashing is
keyed and comparison is timing-safe, and that the schemas accept and reject the
right inputs.

`check:auth:db` runs the real services against a real database and covers new
customer sign-in, a returning customer creating no duplicate, an administrator
keeping ADMIN through a full sign-in, wrong codes incrementing attempts,
lockout, replay refusal, expiry, resend cooldown, the hourly cap, and session
creation, lookup, revocation and expiry. It uses the `+1 555 01xx` range
reserved for fiction and deletes everything it creates, including on failure.
Without a connection it exits cleanly and says what is missing.

Both are plain scripts. No test runner is installed yet; one belongs with the
phase that has more than this to test.

---

## Security notes and residual risk

**Enumeration.** Requesting a code returns the same result whether or not the
number has an account, because accounts are created at verification, not
request. Rate-limit responses do leak a little: being told to wait reveals that
*somebody* recently requested a code for that number. Removing that would mean
lying to legitimate users about why they are waiting, so the trade is
deliberate.

**Timing.** Code comparison is timing-safe. Database lookups are not padded to
a constant duration, so a determined attacker might infer a little from
response times. Given the enumeration surface is already closed at the
behavioural level, constant-time padding was judged not worth the latency.

**Trust boundaries.** The form state travels through the browser and is not
trusted: each action re-reads and re-validates what it needs from the submitted
form. The client address comes from a client-settable header and is used only
to raise the cost of abuse.

**What is not implemented.** There is no account lockout after repeated failed
sign-ins across many challenges, no device or session list in the UI, no
notification when a new device signs in, no step-up check for sensitive admin
actions, and no audit log. None is required to sign in safely; all are worth
revisiting as the store grows.

**Storefront rendering.** Showing who is signed in requires reading a cookie in
the header, which makes `/` and `/shop` render per request instead of being
statically generated as they were before this phase. That is the honest cost of
an authenticated header. Partial Prerendering, which would keep the shell
static and stream only the account slot, is the eventual fix.

---

## Troubleshooting

**"AUTH_SECRET is missing or too short."** Set it in `.env.local` to at least
32 characters. Generate one with `openssl rand -base64 32`.

**No code appears in the terminal.** Check that `pnpm dev` is the terminal you
are watching, that `NODE_ENV` is not `production`, and that the request was not
refused by a rate limit. A refusal is reported in the form.

**"Hold on a moment before asking for another code."** The 60-second cooldown.
Either wait, or lower `AUTH_OTP_RESEND_COOLDOWN_SECONDS` in development.

**"Too many codes have been requested."** The hourly cap for that number or
address. In development, clear it with
`DELETE FROM "OtpChallenge" WHERE "phoneNumber" = '+91...';` in
`pnpm db:studio`.

**Signed in but `/admin` sends me to the storefront.** The account is a
`CUSTOMER`. Set `SEED_ADMIN_PHONE_NUMBER` and run `pnpm db:seed`, then sign in
again.

**`/admin` returns a 500 rather than redirecting.** The database is
unreachable, so the session cannot be resolved. Check `DATABASE_URL` and
`/api/health`.

**Signed out unexpectedly.** The 30-day absolute expiry has passed, or the
session was revoked. Sessions are not extended by use.

**The seeded administrator got a fresh customer account.** The seeded number
was not normalised the same way. Both paths use `normalisePhoneNumber`, so
check the seeded row: `SELECT "phoneNumber", "role" FROM "User";`
