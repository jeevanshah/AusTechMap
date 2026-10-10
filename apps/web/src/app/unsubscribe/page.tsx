import type { Metadata } from "next";
import Link from "next/link";

import {
  unsubscribeSecret,
  verifyUnsubscribeToken,
} from "../../lib/retention/unsubscribeToken";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Unsubscribe from alert emails · Australia Tech Map",
  robots: { index: false },
};

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const done = params.done === "1";
  const token = typeof params.t === "string" ? params.t : "";
  const secret = unsubscribeSecret();
  const valid =
    Boolean(secret) && verifyUnsubscribeToken(token, secret ?? "") !== null;

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-5 px-4 py-10">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs sm:p-8">
        <h1 className="font-heading text-2xl font-extrabold text-navy-900">
          {done ? "You're unsubscribed" : "Unsubscribe from alert emails"}
        </h1>

        {done ? (
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            We won&apos;t send you any more alert emails. In-app alerts on your
            account page keep working, and you can turn emails back on there at
            any time.
          </p>
        ) : valid ? (
          <>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              This stops all new-role and watchlist alert emails from Australia
              Tech Map. Your saved searches, watchlist and profile are not
              changed.
            </p>
            <form
              method="post"
              action={`/api/unsubscribe?t=${encodeURIComponent(token)}`}
              className="mt-5"
            >
              <button
                type="submit"
                className="inline-flex min-h-10 items-center rounded-xl bg-navy-900 px-5 py-2 text-sm font-bold text-white hover:bg-slate-800"
              >
                Unsubscribe from all alert emails
              </button>
            </form>
          </>
        ) : (
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            This unsubscribe link isn&apos;t valid. You can manage alert emails
            from your account instead.
          </p>
        )}

        <Link
          href="/account?tab=searches"
          className="mt-5 inline-block text-sm font-semibold text-terracotta-700 hover:underline"
        >
          Manage alerts in your account
        </Link>
      </section>
    </main>
  );
}
