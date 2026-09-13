import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import { User, LogIn, Sparkles, MapPin, Briefcase, BookOpen } from "lucide-react";

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
  extraRightAction?: ReactNode;
}

export function GlobalNavbar({
  currentPage,
  userEmail,
  subtitle = "National Tech Ecosystem",
  showVerifiedBadge = true,
  extraRightAction,
}: GlobalNavbarProps) {
  return (
    <header className="flex flex-col gap-2.5 border-b border-surface-border pb-3.5">
      {/* Primary Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4">
        {/* Brand & Subtitle */}
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-surface-border shadow-2xs bg-white group-hover:scale-105 active:scale-95 transition-transform">
              <Image
                src="/brand/logo.jpg"
                alt="Australia Tech Map Logo"
                width={40}
                height={40}
                className="h-full w-full object-cover"
                priority
              />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-heading text-base font-bold tracking-tight text-navy-900 leading-none">
                Australia Tech Map
              </span>
              <span className="text-xs text-slate-500 font-medium mt-1 truncate">
                {subtitle}
              </span>
            </div>
          </Link>
        </div>

        {/* Desktop Navigation Links */}
        <nav
          aria-label="Desktop primary navigation"
          className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600"
        >
          <Link
            href="/"
            className={`transition-colors py-1 ${
              currentPage === "map"
                ? "text-navy-900 font-bold cursor-default border-b-2 border-terracotta-700 -mb-0.5"
                : "hover:text-navy-900"
            }`}
          >
            Map Explorer
          </Link>

          <Link
            href="/jobs"
            className={`transition-colors py-1 ${
              currentPage === "jobs"
                ? "text-navy-900 font-bold cursor-default border-b-2 border-terracotta-700 -mb-0.5"
                : "hover:text-navy-900"
            }`}
          >
            Live jobs
          </Link>

          <Link
            href="/opportunities"
            className={`flex items-center gap-1.5 transition-colors py-1 ${
              currentPage === "opportunities"
                ? "text-navy-900 font-bold cursor-default border-b-2 border-terracotta-700 -mb-0.5"
                : "hover:text-navy-900"
            }`}
          >
            <span>Opportunity Match</span>
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                currentPage === "opportunities"
                  ? "bg-terracotta-700 text-white"
                  : "bg-terracotta-50 border border-terracotta-200 text-terracotta-800"
              }`}
            >
              Engine
            </span>
          </Link>

          <Link
            href="/methodology"
            className={`transition-colors py-1 ${
              currentPage === "methodology"
                ? "text-navy-900 font-bold cursor-default border-b-2 border-terracotta-700 -mb-0.5"
                : "hover:text-navy-900"
            }`}
          >
            Methodology
          </Link>
        </nav>

        {/* Right Controls: Verified Badge, Custom Action & Auth */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {showVerifiedBadge && (
            <span className="hidden lg:inline-flex items-center gap-1.5 rounded-full border border-surface-border bg-white px-3 py-1 font-mono text-[11px] font-semibold text-slate-800 shadow-2xs">
              <span className="h-2 w-2 rounded-full bg-emerald-600 animate-pulse" />
              Verified Registry
            </span>
          )}

          {userEmail ? (
            <Link
              href="/account"
              className="inline-flex items-center gap-1.5 rounded-lg border border-surface-border bg-white px-3 py-1.5 text-xs font-semibold text-navy-900 shadow-2xs hover:bg-slate-50 hover:border-slate-300 active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-700"
            >
              <User className="h-3.5 w-3.5 text-slate-500" />
              <span className="max-w-[100px] sm:max-w-[140px] truncate">
                {userEmail}
              </span>
            </Link>
          ) : (
            <Link
              href="/sign-in"
              className="inline-flex items-center gap-1.5 rounded-lg border border-surface-border bg-white px-3 py-1.5 text-xs font-semibold text-navy-900 shadow-2xs hover:bg-slate-50 hover:border-slate-300 active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-700"
            >
              <LogIn className="h-3.5 w-3.5 text-slate-500" />
              <span>Sign in</span>
            </Link>
          )}

          {extraRightAction}
        </div>
      </div>

      {/* Mobile Sub-Navigation Pill Strip (< md) */}
      <nav
        aria-label="Mobile navigation"
        className="flex md:hidden w-full items-center gap-1.5 overflow-x-auto no-scrollbar pt-1 text-xs font-medium"
      >
        <Link
          href="/"
          className={`shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-all active:scale-95 ${
            currentPage === "map"
              ? "bg-navy-900 text-white font-bold shadow-xs"
              : "bg-slate-100/90 text-slate-700 hover:bg-slate-200"
          }`}
        >
          <MapPin className="h-3 w-3" />
          <span>Map</span>
        </Link>

        <Link
          href="/jobs"
          className={`shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-all active:scale-95 ${
            currentPage === "jobs"
              ? "bg-navy-900 text-white font-bold shadow-xs"
              : "bg-slate-100/90 text-slate-700 hover:bg-slate-200"
          }`}
        >
          <Briefcase className="h-3 w-3" />
          <span>Live jobs</span>
        </Link>

        <Link
          href="/opportunities"
          className={`shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-all active:scale-95 ${
            currentPage === "opportunities"
              ? "bg-navy-900 text-white font-bold shadow-xs"
              : "bg-slate-100/90 text-slate-700 hover:bg-slate-200"
          }`}
        >
          <Sparkles className="h-3 w-3 text-terracotta-600" />
          <span>Opportunity Match</span>
        </Link>

        <Link
          href="/methodology"
          className={`shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-all active:scale-95 ${
            currentPage === "methodology"
              ? "bg-navy-900 text-white font-bold shadow-xs"
              : "bg-slate-100/90 text-slate-700 hover:bg-slate-200"
          }`}
        >
          <BookOpen className="h-3 w-3" />
          <span>Methodology</span>
        </Link>
      </nav>
    </header>
  );
}
