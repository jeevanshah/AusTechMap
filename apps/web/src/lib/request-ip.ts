import { headers } from "next/headers";

/**
 * Best-effort client IP for rate-limiting keys. Deliberately has no
 * dependency on Auth.js or anything auth-related -- it's a request-layer
 * concern, not an authorization one, and keeping it standalone avoids
 * dragging the next-auth import chain into anything that only needs an
 * IP address (see the Vitest/next-auth resolution gotcha documented in
 * HANDOFF.md).
 *
 * Precedence: `x-vercel-forwarded-for` (set by Vercel's edge network,
 * not attacker-controlled from outside it) first, then the more general
 * `x-forwarded-for`, then `x-real-ip`, then "unknown". Each header may
 * carry a comma-separated list (proxy chain); the first non-empty,
 * trimmed entry is taken as the client address -- never an empty string.
 */
const IP_HEADER_PRECEDENCE = [
  "x-vercel-forwarded-for",
  "x-forwarded-for",
  "x-real-ip",
] as const;

function firstNonEmptyAddress(headerValue: string): string | null {
  for (const part of headerValue.split(",")) {
    const trimmed = part.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

export async function currentClientIp(): Promise<string> {
  const jar = await headers();
  for (const name of IP_HEADER_PRECEDENCE) {
    const value = jar.get(name);
    if (value) {
      const address = firstNonEmptyAddress(value);
      if (address) return address;
    }
  }
  return "unknown";
}
