import { createCompany } from "../actions";

export const dynamic = "force-dynamic";

export default function NewCompanyPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-8 sm:px-10 sm:py-12">
      <header className="border-b border-emerald-950/15 pb-5">
        <span className="text-sm font-semibold tracking-[0.18em] uppercase">
          New company
        </span>
      </header>

      <form action={createCompany} className="flex flex-col gap-5">
        <label className="flex flex-col gap-1 text-sm">
          Display name
          <input
            name="display_name"
            required
            className="rounded-lg border border-emerald-950/20 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          ABN (optional, 11 digits)
          <input
            name="abn"
            className="rounded-lg border border-emerald-950/20 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          ACN (optional, 9 digits)
          <input
            name="acn"
            className="rounded-lg border border-emerald-950/20 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Domain (optional)
          <input
            name="domain"
            className="rounded-lg border border-emerald-950/20 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Careers URL (optional)
          <input
            name="careers_url"
            className="rounded-lg border border-emerald-950/20 px-3 py-2"
          />
        </label>
        <button
          type="submit"
          className="rounded-full bg-emerald-900 px-4 py-2 text-sm font-medium text-white"
        >
          Create company
        </button>
      </form>
    </main>
  );
}
