import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="text-sm font-semibold tracking-[0.18em] uppercase">
        Australia Tech Map
      </span>
      <h1 className="text-3xl font-semibold">Page not found</h1>
      <p className="text-emerald-950/70">
        We couldn&apos;t find what you were looking for.
      </p>
      <Link
        href="/"
        className="rounded-full bg-emerald-900 px-4 py-2 text-sm font-medium text-white"
      >
        Back to the map
      </Link>
    </main>
  );
}
