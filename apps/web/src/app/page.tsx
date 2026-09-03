const foundationItems = [
  "Evidence-backed employer profiles",
  "Australian geography and regional context",
  "Transparent hiring and sponsorship signals",
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col justify-between px-6 py-8 sm:px-10 sm:py-12">
      <header className="flex items-center justify-between border-b border-emerald-950/15 pb-5">
        <span className="text-sm font-semibold tracking-[0.18em] uppercase">
          Australia Tech Map
        </span>
        <span className="rounded-full bg-emerald-900 px-3 py-1 text-xs font-medium text-white">
          Foundation build
        </span>
      </header>

      <section className="grid gap-12 py-20 lg:grid-cols-[1.4fr_0.8fr] lg:items-end">
        <div>
          <p className="mb-5 text-sm font-semibold tracking-[0.2em] text-emerald-800 uppercase">
            Find where Australian tech opportunity lives
          </p>
          <h1 className="max-w-4xl text-5xl leading-[0.98] font-semibold tracking-[-0.05em] sm:text-7xl">
            A clearer map of employers, regions, and real opportunity.
          </h1>
        </div>

        <div className="border-l-2 border-emerald-800 pl-6">
          <p className="text-base leading-7 text-emerald-950/75">
            The platform foundation is running. Data ingestion and discovery
            features will land in measured, auditable phases.
          </p>
        </div>
      </section>

      <section className="grid gap-px overflow-hidden rounded-2xl border border-emerald-950/15 bg-emerald-950/15 sm:grid-cols-3">
        {foundationItems.map((item, index) => (
          <div className="bg-[#faf9f5] p-6" key={item}>
            <span className="mb-8 block font-mono text-xs text-emerald-700">
              0{index + 1}
            </span>
            <p className="max-w-xs text-lg font-medium leading-6">{item}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
