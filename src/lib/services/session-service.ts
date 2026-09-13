import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { prisma } from "@/lib/db/client";
import { sessionConfig } from "@/lib/auth/config";
import type { Role } from "@/generated/prisma/enums";

/**
 * Session records: issue, resolve, revoke.
 *
 * The browser holds an opaque random token. The database stores only its
 * SHA-256 digest, so reading the table does not yield a usable session. A
 * plain digest is enough here, unlike for OTP codes, because the token carries
 * 256 bits of entropy and cannot be brute forced from its hash.
 */

/** Identity the rest of the application is allowed to see. */
export type SessionUser = {
  id: string;
  phoneNumber: string;
  name: string | null;
  role: Role;
};

const TOKEN_BYTES = 32;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type IssuedSession = {
  token: string;
  expiresAt: Date;
};

/**
 * Create a session row and return the token to hand to the browser.
 *
 * The plaintext token is returned exactly once, here, and never persisted.
 */
export async function createSession(userId: string): Promise<IssuedSession> {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const expiresAt = new Date(
    Date.now() + sessionConfig.ttlDays * 24 * 60 * 60 * 1000,
  );

  await prisma.session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt },
    select: { id: true },
  });

  return { token, expiresAt };
}

/**
 * Resolve a token to the signed-in user, or null.
 *
 * Expiry and revocation are part of the lookup rather than a later check, so
 * there is no window in which a dead session resolves to a user.
 */
export async function findSessionUser(
  token: string,
): Promise<SessionUser | null> {
  if (!token) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      expiresAt: true,
      revokedAt: true,
      user: {
        select: { id: true, phoneNumber: true, name: true, role: true },
      },
    },
  });

  if (!session || session.revokedAt || session.expiresAt <= new Date()) {
    return null;
  }

  return session.user;
}

/**
 * Revoke one session. Used by logout.
 *
 * The row is marked rather than deleted so a future "recent activity" screen
 * can still show that the device signed out. `updateMany` keeps this a no-op
 * for a token that is already gone.
 */
export async function revokeSession(token: string): Promise<void> {
  if (!token) {
    return;
  }

  await prisma.session.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Revoke every session for a user, signing them out everywhere.
 *
 * Not reachable from the UI yet. It exists because account-level revocation is
 * the reason sessions are database rows, and an operator needs it the moment
 * an account is compromised.
 */
export async function revokeAllSessionsForUser(userId: string): Promise<number> {
  const { count } = await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  return count;
}

/**
 * Delete sessions that expired some time ago.
 *
 * Not called during a request; here so a scheduled job can use it later.
 */
export async function deleteExpiredSessions(): Promise<number> {
  const { count } = await prisma.session.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  });

  return count;
}
