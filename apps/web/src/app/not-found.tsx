import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, MapPin, Briefcase, Sparkles, Compass } from "lucide-react";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 py-16 text-center sm:px-6">
      <div className="w-full max-w-lg rounded-2xl border border-surface-border bg-white p-8 shadow-sm sm:p-10">
        {/* Brand Mark */}
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-surface-border bg-white shadow-2xs">
          <Image
            src="/brand/logo.jpg"
            alt="Australia Tech Map Logo"
            width={64}
            height={64}
            className="h-full w-full object-cover"
            priority
          />
        </div>

        {/* 404 Status Pill */}
        <div className="mx-auto mb-4 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
          <span className="h-2 w-2 rounded-full bg-terracotta-700" />
          <span>404 • Resource Not Found</span>
        </div>

        <h1 className="font-heading text-2xl font-bold tracking-tight text-navy-900 sm:text-3xl">
          Page Not Located
        </h1>

        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          The registry record, directory listing, or ecosystem page you are looking for
          may have been moved or does not exist.
        </p>

        {/* Primary Action */}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-navy-900 px-5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-900"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Return to Map Directory</span>
          </Link>
          <Link
            href="/jobs"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-surface-border bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 shadow-2xs hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-700"
          >
            <Briefcase className="h-4 w-4 text-slate-500" />
            <span>Explore Live Jobs</span>
          </Link>
        </div>

        {/* Quick Links Footer */}
        <div className="mt-10 border-t border-surface-border pt-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Popular Destinations
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs">
            <Link
              href="/opportunities"
              className="inline-flex items-center gap-1 rounded-lg border border-surface-border bg-slate-50 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <Sparkles className="h-3 w-3 text-terracotta-700" />
              <span>Opportunity Match</span>
            </Link>
            <Link
              href="/methodology"
              className="inline-flex items-center gap-1 rounded-lg border border-surface-border bg-slate-50 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <Compass className="h-3 w-3 text-slate-500" />
              <span>Methodology & Standards</span>
            </Link>
            <Link
              href="/#directory-content"
              className="inline-flex items-center gap-1 rounded-lg border border-surface-border bg-slate-50 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <MapPin className="h-3 w-3 text-emerald-600" />
              <span>Browse Companies</span>
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
