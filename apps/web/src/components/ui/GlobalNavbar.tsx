import Link from "next/link";
import Image from "next/image";
import { User, LogIn } from "lucide-react";

export type NavActivePage =
  | "map"
  | "jobs"
  | "opportunities"
  | "methodology"
  | "regions"
  | "companies";

export interface GlobalNavbarProps {
  currentPage?: NavActivePage;
  userEmail?: string | null;
  subtitle?: string;
  showVerifiedBadge?: boolean;
}

export function GlobalNavbar({
  currentPage,
  userEmail,
  subtitle = "National Tech Ecosystem",
  showVerifiedBadge = true,
}: GlobalNavbarProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-surface-border pb-4">
      {/* Brand & Subtitle */}
      <div className="flex items-center gap-3">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="relative h-10 w-10 overflow-hidden rounded-xl border border-surface-border shadow-2xs bg-white group-hover:scale-105 transition-transform">
            <Image
              src="/brand/logo.jpg"
              alt="Australia Tech Map Logo"
              width={40}
              height={40}
              className="h-full w-full object-cover"
              priority
            />
          </div>
          <div className="flex flex-col">
            <span className="font-heading text-base font-bold tracking-tight text-navy-900 leading-none">
              Australia Tech Map
            </span>
            <span className="text-xs text-slate-500 font-medium mt-1">
              {subtitle}
            </span>
          </div>
        </Link>
      </div>

      {/* Navigation Links */}
      <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
        <Link
          href="/"
          className={`transition-colors ${
            currentPage === "map"
              ? "text-navy-900 font-semibold cursor-default border-b-2 border-terracotta-700 pb-0.5"
              : "hover:text-navy-900"
          }`}
        >
          Map Explorer
        </Link>

        <Link
          href="/jobs"
          className={`transition-colors ${
            currentPage === "jobs"
              ? "text-navy-900 font-semibold cursor-default border-b-2 border-terracotta-700 pb-0.5"
              : "hover:text-navy-900"
          }`}
        >
          Live jobs
        </Link>

        <Link
          href="/opportunities"
          className={`flex items-center gap-1 transition-colors ${
            currentPage === "opportunities"
              ? "text-navy-900 font-semibold cursor-default border-b-2 border-terracotta-700 pb-0.5"
              : "hover:text-navy-900"
          }`}
        >
          <span>Opportunity Match</span>
          <span className="rounded-full bg-terracotta-50 border border-terracotta-200 px-1.5 py-0.2 text-[10px] font-bold text-terracotta-800">
            Engine
          </span>
        </Link>

        <Link
          href="/methodology"
          className={`transition-colors ${
            currentPage === "methodology"
              ? "text-navy-900 font-semibold cursor-default border-b-2 border-terracotta-700 pb-0.5"
              : "hover:text-navy-900"
          }`}
        >
          Methodology
        </Link>
      </nav>

      {/* Right Controls: Verified Badge & Auth */}
      <div className="flex items-center gap-2.5">
        {showVerifiedBadge && (
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-surface-border bg-white px-3 py-1 font-mono text-[11px] font-semibold text-slate-800 shadow-2xs">
            <span className="h-2 w-2 rounded-full bg-emerald-600 animate-pulse" />
            Verified Registry
          </span>
        )}

        {userEmail ? (
          <Link
            href="/account"
            className="inline-flex items-center gap-1.5 rounded-lg border border-surface-border bg-white px-3 py-1.5 text-xs font-semibold text-navy-900 shadow-2xs hover:bg-slate-50 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-700"
          >
            <User className="h-3.5 w-3.5 text-slate-500" />
            <span className="max-w-[120px] truncate">{userEmail}</span>
          </Link>
        ) : (
          <Link
            href="/sign-in"
            className="inline-flex items-center gap-1.5 rounded-lg border border-surface-border bg-white px-3 py-1.5 text-xs font-semibold text-navy-900 shadow-2xs hover:bg-slate-50 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-700"
          >
            <LogIn className="h-3.5 w-3.5 text-slate-500" />
            <span>Sign in</span>
          </Link>
        )}
      </div>
    </header>
  );
}
