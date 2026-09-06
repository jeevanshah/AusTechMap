/**
 * Kept separate from require-role.ts (which imports ../../auth, and
 * transitively next-auth) so tests that only need these classes for
 * instanceof checks can import them without dragging in next-auth --
 * Vitest's plain Node ESM resolution doesn't apply Next.js's own bundler
 * resolution for `next/server`, which next-auth's package imports
 * unconditionally.
 */
export class UnauthenticatedError extends Error {
  constructor() {
    super("no valid session");
    this.name = "UnauthenticatedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "insufficient role") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class MfaStaleError extends Error {
  constructor() {
    super("MFA verification has expired, re-verify to continue");
    this.name = "MfaStaleError";
  }
}
