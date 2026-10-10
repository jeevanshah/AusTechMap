import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed, expiry-free capability tokens for one-click email unsubscribe.
 *
 * The token carries only the numeric user id plus an HMAC; it grants exactly
 * one ability (suppress that user's alert email), so it does not expire: a
 * months-old email must still be able to unsubscribe. Signed with AUTH_SECRET
 * under a purpose prefix so it cannot be confused with any other signature.
 */

const PURPOSE = "email-unsubscribe:v1";

function sign(userId: number, secret: string): Buffer {
  return createHmac("sha256", secret).update(`${PURPOSE}:${userId}`).digest();
}

export function createUnsubscribeToken(userId: number, secret: string): string {
  if (!secret) throw new Error("Unsubscribe signing secret is not configured.");
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new Error("Invalid user id for unsubscribe token.");
  }
  return `${userId}.${sign(userId, secret).toString("base64url")}`;
}

/** Returns the user id when the token is authentic, otherwise null. */
export function verifyUnsubscribeToken(
  token: string | null | undefined,
  secret: string,
): number | null {
  if (!token || !secret || token.length > 200) return null;
  const [idPart, sigPart, ...rest] = token.split(".");
  if (
    !idPart ||
    !sigPart ||
    rest.length > 0 ||
    !/^[1-9]\d{0,15}$/.test(idPart)
  ) {
    return null;
  }
  const userId = Number(idPart);
  if (!Number.isSafeInteger(userId)) return null;

  const given = Buffer.from(sigPart, "base64url");
  const expected = sign(userId, secret);
  if (given.length !== expected.length) return null;
  return timingSafeEqual(given, expected) ? userId : null;
}

/** The secret used to sign tokens; null when the deployment has none. */
export function unsubscribeSecret(): string | null {
  return process.env.AUTH_SECRET?.trim() || null;
}
