import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";

import { getPool } from "./lib/db";
import { RoleAwareAdapter } from "./lib/auth/adapter";
import {
  SESSION_UPDATE_AGE_S,
  USER_SESSION_MAX_AGE_S,
} from "./lib/auth/session-policy";

// V1's public sign-in method (ARCHITECTURE_DECISIONS.md §4.1): a one-use
// Resend email magic link that expires after 10 minutes -- overriding the
// provider's own 24h default. `from` is the Resend sandbox sender until a
// real account/verified domain exists (only delivers to the account
// owner's own address) -- a deliberate, named interim state, same pattern
// as this project's Nominatim-before-G-NAF precedent. Swap only the `from`
// value the day a real domain is verified; nothing else changes.
const MAGIC_LINK_MAX_AGE_S = 10 * 60;
const RESEND_FROM = process.env.AUTH_RESEND_FROM ?? "onboarding@resend.dev";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: RoleAwareAdapter(getPool()),
  providers: [
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY,
      from: RESEND_FROM,
      maxAge: MAGIC_LINK_MAX_AGE_S,
    }),
  ],
  session: {
    strategy: "database",
    // The adapter wrapper always substitutes a role-aware expires; these
    // are the values Auth.js core computes before that override runs, and
    // updateAge governs how often it even attempts to touch the session
    // (satisfying "rotate at least daily" without rotating more than that).
    maxAge: USER_SESSION_MAX_AGE_S,
    updateAge: SESSION_UPDATE_AGE_S,
  },
  pages: {
    signIn: "/sign-in",
  },
  callbacks: {
    // Used only by proxy.ts's thin, non-authoritative redirect layer --
    // real enforcement is lib/auth/require-role.ts, called from every
    // admin page/server action independently (see proxy.ts's own comment).
    authorized({ auth }) {
      return !!auth?.user;
    },
    async signIn({ user }) {
      // §4.1: role/status come from the database, never trusted from the
      // provider payload. A brand-new user has no id yet (status defaults
      // to 'active' at creation) -- only a returning, disabled/pending-
      // deletion account is rejected here.
      if (!user.id) return true;
      const result = await getPool().query<{ status: string }>(
        "SELECT status FROM users WHERE id = $1",
        [user.id],
      );
      const status = result.rows[0]?.status;
      return status !== "disabled" && status !== "deletion_pending";
    },
    async session({ session, user }) {
      // @auth/core's session action spreads the raw DB session row (from
      // getSessionAndUser's `select *`) onto `session` before invoking this
      // callback, and passes the raw `select *` user row as `user` -- so
      // mfa_verified_at/role/status are already present here with no extra
      // query needed (verified directly against
      // node_modules/@auth/core/src/lib/actions/session.ts).
      const rawSession = session as unknown as {
        mfa_verified_at?: Date | null;
      };
      const rawUser = user as unknown as { role?: string; status?: string };
      return {
        ...session,
        user: {
          ...session.user,
          // Display hints only -- every protected server request re-derives
          // these live via lib/auth/require-role.ts, never trusts this
          // client-visible copy as an authorisation boundary.
          role: rawUser.role ?? "user",
          status: rawUser.status ?? "active",
          mfaVerifiedAt: rawSession.mfa_verified_at ?? null,
        },
      };
    },
  },
});
