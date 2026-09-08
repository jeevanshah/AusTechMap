import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BookOpen, Compass, Scale, ShieldCheck, Sparkles } from "lucide-react";

export const metadata: Metadata = {
  title: "Methodology & Opportunity Graph Standards — Australia Tech Map",
  description:
    "Scientific methodology, scoring models, regional classification, and data verification standards governing Australia Tech Map.",
  alternates: { canonical: "/methodology" },
};

export default function MethodologyPage() {
  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-10 sm:px-10 sm:py-16">
      {/* Navigation Header */}
      <nav className="flex items-center justify-between border-b border-surface-border pb-5">
        <Link
          href="/"
          className="inline-flex items-center text-sm font-semibold text-slate-700 hover:text-navy-900 transition-colors"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Map
        </Link>
        <span className="font-mono text-xs font-bold uppercase tracking-wider text-slate-400">
          Methodology v1.0 • September 2026
        </span>
      </nav>

      <article className="mt-10 space-y-12">
        {/* Title */}
        <header className="space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-terracotta-200 bg-terracotta-50 px-3 py-1 font-mono text-xs font-semibold text-terracotta-800">
            <BookOpen className="h-3.5 w-3.5" />
            <span>Official Research Standards</span>
          </div>
          <h1 className="font-heading text-4xl font-extrabold tracking-tight text-navy-900 sm:text-5xl">
            Methodology & Opportunity Graph Architecture
          </h1>
          <p className="text-lg leading-relaxed text-slate-600">
            Australia Tech Map models the real geographic and professional technology economy of Australia. This document specifies the deterministic algorithms, government datasets, and evidence verification standards that power the platform.
          </p>
        </header>

        {/* Section 1: Product Thesis */}
        <section className="space-y-4 rounded-2xl border border-surface-border bg-white p-7 shadow-2xs">
          <div className="flex items-center gap-3 text-navy-900">
            <Sparkles className="h-5 w-5 text-terracotta-700" />
            <h2 className="font-heading text-2xl font-bold">1. The Opportunity Graph</h2>
          </div>
          <p className="text-sm leading-relaxed text-slate-600">
            Unlike generic job boards or static startup directories, Australia Tech Map is built upon an immutable, longitudinal Opportunity Graph. It connects six primary entities:
          </p>
          <div className="grid gap-3 sm:grid-cols-2 pt-2">
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-xs">
              <span className="font-bold text-navy-900 block mb-1">Company Identity</span>
              Official ASIC ABN/ACN registry verification, primary operating domains, and deduplicated brand aliases.
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-xs">
              <span className="font-bold text-navy-900 block mb-1">Geospatial Boundaries</span>
              Physical premises geocoded against Geoscape G-NAF and bound to ABS ASGS 2021 Statistical Area Level 4 (SA4) regions.
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-xs">
              <span className="font-bold text-navy-900 block mb-1">Role & Skill Demand</span>
              Standardized tech role families and observed technology stacks scraped directly from verified employer ATS careers portals.
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-xs">
              <span className="font-bold text-navy-900 block mb-1">Migration Evidence</span>
              Primary Department of Home Affairs Accredited Sponsor lists and approved Skilled Refugee / Labour Agreements.
            </div>
          </div>
        </section>

        {/* Section 2: Opportunity Match Engine */}
        <section className="space-y-4 rounded-2xl border border-surface-border bg-white p-7 shadow-2xs">
          <div className="flex items-center gap-3 text-navy-900">
            <Scale className="h-5 w-5 text-emerald-700" />
            <h2 className="font-heading text-2xl font-bold">2. Opportunity Match 100-Point Formula</h2>
          </div>
          <p className="text-sm leading-relaxed text-slate-600">
            Opportunity Match ranks employers according to candidate career preferences using a transparent 100-point rubric (§18.2). Every recommendation produces verifiable explainability bullet points:
          </p>
          <div className="space-y-3 pt-2">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3 text-xs">
              <div>
                <span className="font-bold text-slate-900">Role Family Fit (Max 30 pts)</span>
                <p className="text-slate-500 mt-0.5">Exact role family match in active roles (30 pts), adjacent sector hiring (15 pts), or industry category baseline (10 pts).</p>
              </div>
              <span className="font-mono font-bold text-emerald-700">30%</span>
            </div>
            <div className="flex items-start justify-between border-b border-slate-100 pb-3 text-xs">
              <div>
                <span className="font-bold text-slate-900">Current Hiring Velocity (Max 20 pts)</span>
                <p className="text-slate-500 mt-0.5">Volume of active tech openings: 5+ roles (20 pts), 3-4 roles (16 pts), 1-2 roles (12 pts), other open tech jobs (8 pts).</p>
              </div>
              <span className="font-mono font-bold text-emerald-700">20%</span>
            </div>
            <div className="flex items-start justify-between border-b border-slate-100 pb-3 text-xs">
              <div>
                <span className="font-bold text-slate-900">Skill Alignment (Max 15 pts)</span>
                <p className="text-slate-500 mt-0.5">Ratio of candidate-specified skills matched against verified job skills and historical employer tech stacks.</p>
              </div>
              <span className="font-mono font-bold text-emerald-700">15%</span>
            </div>
            <div className="flex items-start justify-between border-b border-slate-100 pb-3 text-xs">
              <div>
                <span className="font-bold text-slate-900">Location & Work Style (Max 15 pts)</span>
                <p className="text-slate-500 mt-0.5">Target city/state presence (10 pts) + work-style evidence (5 pts). Strict exclusions apply when requested.</p>
              </div>
              <span className="font-mono font-bold text-emerald-700">15%</span>
            </div>
            <div className="flex items-start justify-between border-b border-slate-100 pb-3 text-xs">
              <div>
                <span className="font-bold text-slate-900">Hiring Momentum (Max 10 pts)</span>
                <p className="text-slate-500 mt-0.5">Longitudinal hiring frequency and consistency across distinct observation cycles.</p>
              </div>
              <span className="font-mono font-bold text-emerald-700">10%</span>
            </div>
            <div className="flex items-start justify-between text-xs">
              <div>
                <span className="font-bold text-slate-900">Sponsorship & Regional Hubs (Max 10 pts)</span>
                <p className="text-slate-500 mt-0.5">Home Affairs accredited sponsorship evidence or footprint in a designated regional Australian innovation ecosystem.</p>
              </div>
              <span className="font-mono font-bold text-emerald-700">10%</span>
            </div>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
            <span className="font-bold block mb-1">Honest Zero-Result Guarantee</span>
            If a query targets specific roles or skills and no company matches or the score falls below 40, Australia Tech Map returns an honest empty state with filter guidance rather than hallucinating unrelated employers (Golden Query GQ-24 compliant).
          </div>
        </section>

        {/* Section 3: Regional Tech Opportunity Score */}
        <section className="space-y-4 rounded-2xl border border-surface-border bg-white p-7 shadow-2xs">
          <div className="flex items-center gap-3 text-navy-900">
            <Compass className="h-5 w-5 text-sky-700" />
            <h2 className="font-heading text-2xl font-bold">3. Regional Tech Opportunity Score</h2>
          </div>
          <p className="text-sm leading-relaxed text-slate-600">
            Each of Australia’s 89 Statistical Area Level 4 (SA4) regions is evaluated using a 100-point regional index combining Jobs and Skills Australia (JSA) NERO/IVI signals with verified employer premises:
          </p>
          <ul className="list-disc pl-5 text-xs text-slate-600 space-y-1.5 leading-relaxed">
            <li><strong>Data Sufficiency Gate:</strong> A regional score is strictly suppressed if a region has fewer than 5 mapped employers, fewer than 3 location-confirmed jobs, or fewer than 14 days of hiring history.</li>
            <li><strong>Designated Regional Migration:</strong> Incorporates Department of Home Affairs Category 2 (Cities & Major Regional Centres) and Category 3 (Regional Centres and Other Regional Areas) statutory definitions.</li>
            <li><strong>Designated Area Migration Agreements (DAMA):</strong> Explicitly cross-references DAMA postcodes to highlight migration concessions without presenting them as individual eligibility.</li>
          </ul>
        </section>

        {/* Section 4: Home Affairs Sourcing */}
        <section className="space-y-4 rounded-2xl border border-surface-border bg-white p-7 shadow-2xs">
          <div className="flex items-center gap-3 text-navy-900">
            <ShieldCheck className="h-5 w-5 text-forest-700" />
            <h2 className="font-heading text-2xl font-bold">4. Visa Sponsorship Evidence Integrity</h2>
          </div>
          <p className="text-sm leading-relaxed text-slate-600">
            Sponsorship claims require verifiable, current primary evidence. We distinguish strictly between three evidence states:
          </p>
          <div className="grid gap-3 sm:grid-cols-3 pt-2 text-xs">
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5">
              <span className="font-bold text-slate-900 block mb-1">Labour Agreement</span>
              Approved Minister-negotiated Labour Agreements (e.g. Skilled Refugee Pilot).
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5">
              <span className="font-bold text-slate-900 block mb-1">Accredited Sponsor</span>
              Department of Home Affairs verified Accredited Sponsor under Subclass 482.
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5">
              <span className="font-bold text-slate-900 block mb-1">No Claim Status</span>
              Absence of evidence is never presented as negative; no unsupported claim is ever made.
            </div>
          </div>
          <p className="text-xs text-slate-500 italic mt-3">
            Disclaimer: Australia Tech Map is not a registered migration agent. Employer sponsorship data does not guarantee individual visa eligibility.
          </p>
        </section>
      </article>
    </main>
  );
}
