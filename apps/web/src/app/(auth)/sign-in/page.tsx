import { requestMagicLink } from "./actions";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-6 py-8">
      <header className="border-b border-emerald-950/15 pb-5">
        <span className="text-sm font-semibold tracking-[0.18em] uppercase">
          Sign in
        </span>
      </header>

      <form action={requestMagicLink} className="flex flex-col gap-5">
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            type="email"
            name="email"
            required
            className="rounded-lg border border-emerald-950/20 px-3 py-2"
          />
        </label>
        <button
          type="submit"
          className="rounded-full bg-emerald-900 px-4 py-2 text-sm font-medium text-white"
        >
          Send sign-in link
        </button>
      </form>
    </main>
  );
}
