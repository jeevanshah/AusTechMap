import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ShieldCheck,
  BookmarkCheck,
  BellRing,
  Building2,
  AlertCircle,
} from "lucide-react";

import { sanitizeCallbackUrl } from "../../../lib/auth/callback-url";
import { OAuthButtons } from "./OAuthButtons";
import { MagicLinkForm } from "./MagicLinkForm";

export const dynamic = "force-dynamic";

interface SignInPageProps {
  searchParams: Promise<{
    callbackUrl?: string;
    error?: string;
  }>;
}

function getErrorMessage(errorCode?: string): string | null {
  if (!errorCode) return null;
  switch (errorCode) {
    case "OAuthAccountNotLinked":
      return "An account already exists with this email address. Please sign in with the method originally used to link your accounts.";
    case "OAuthSignin":
    case "OAuthCallback":
      return "Could not connect to the authentication provider. Please try again or use email magic link.";
    case "Verification":
      return "The sign-in link was invalid or has expired. Please request a new one below.";
    case "AccessDenied":
      return "Access was denied. Please contact support if you believe this is an error.";
    default:
      return "An error occurred during authentication. Please try again.";
  }
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const callbackUrl = sanitizeCallbackUrl(params.callbackUrl);
  const errorMessage = getErrorMessage(params.error);

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      {/* Minimal Top Header */}
      <header className="border-b border-surface-border/80 bg-white/70 backdrop-blur-md sticky top-0 z-10 px-4 py-3 sm:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2.5 group text-navy-900 transition-opacity hover:opacity-90"
          >
            <div className="relative h-8 w-8 overflow-hidden rounded-lg border border-surface-border shadow-2xs">
              <Image
                src="/brand/logo.jpg"
                alt="Australia Tech Map Logo"
                width={32}
                height={32}
                className="h-full w-full object-cover"
                priority
              />
            </div>
            <span className="font-heading text-sm font-bold tracking-tight">
              Australia Tech Map
            </span>
          </Link>

          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-navy-900 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Explorer</span>
          </Link>
        </div>
      </header>

      {/* Main Content Layout */}
      <main className="mx-auto flex w-full max-w-5xl flex-1 items-center justify-center px-4 py-8 sm:px-6 md:py-16">
        <div className="grid w-full grid-cols-1 items-center gap-8 lg:grid-cols-12 lg:gap-12">
          {/* Left Column: Value Proposition & Privacy Guarantees */}
          <div className="flex flex-col gap-6 lg:col-span-6 lg:pr-4">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-forest-200 bg-forest-50 px-3 py-1 text-xs font-semibold text-forest-700">
              <ShieldCheck className="h-3.5 w-3.5 text-forest-600" />
              <span>Zero-Password Security &middot; APP 11 Compliant</span>
            </div>

            <div className="flex flex-col gap-3">
              <h1 className="font-heading text-3xl font-extrabold tracking-tight text-navy-950 sm:text-4xl">
                Evidence-backed intelligence, personalized to you.
              </h1>
              <p className="text-sm leading-relaxed text-slate-600 sm:text-base">
                Sign in to customize your ecosystem view, save high-signal market queries, and track hiring velocity across Australia&apos;s leading technology companies.
              </p>
            </div>

            {/* Feature Highlights */}
            <div className="flex flex-col gap-4 pt-2">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy-50 text-navy-800 border border-navy-100">
                  <BookmarkCheck className="h-4 w-4" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-navy-900">
                    Saved Market Searches
                  </span>
                  <span className="text-xs text-slate-500 leading-relaxed">
                    Bookmark bespoke geographic, industry, and role filters with one-click access.
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-terracotta-50 text-terracotta-700 border border-terracotta-100">
                  <Building2 className="h-4 w-4" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-navy-900">
                    Employer & Hub Watchlists
                  </span>
                  <span className="text-xs text-slate-500 leading-relaxed">
                    Monitor growth signals and vacancy surges across 1,800+ verified employers.
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-pacific-50 text-pacific-700 border border-pacific-100">
                  <BellRing className="h-4 w-4" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-navy-900">
                    Proactive Intelligence Alerts
                  </span>
                  <span className="text-xs text-slate-500 leading-relaxed">
                    Receive weekly vacancy digests and ecosystem reports straight to your inbox.
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Sign In Card */}
          <div className="lg:col-span-6">
            <div className="rounded-2xl border border-surface-border bg-white p-6 shadow-sm sm:p-8">
              {/* Card Header */}
              <div className="flex flex-col gap-1.5 pb-6 border-b border-surface-border">
                <h2 className="font-heading text-xl font-bold text-navy-900">
                  Sign in to your account
                </h2>
                <p className="text-xs text-slate-500">
                  Select your preferred sign-in method to continue.
                </p>
              </div>

              {/* Error Banner */}
              {errorMessage && (
                <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
                  <p>{errorMessage}</p>
                </div>
              )}

              {/* OAuth Providers */}
              <div className="mt-6 flex flex-col gap-3">
                <OAuthButtons callbackUrl={callbackUrl} />
              </div>

              {/* Divider */}
              <div className="relative my-6 flex items-center justify-center">
                <div className="w-full border-t border-slate-200"></div>
                <span className="absolute bg-white px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  or email magic link
                </span>
              </div>

              {/* Passwordless Magic Link Form */}
              <MagicLinkForm callbackUrl={callbackUrl} />

              {/* Privacy & Zero Password Guarantee */}
              <div className="mt-6 pt-4 border-t border-slate-100 text-center">
                <p className="text-[11px] leading-normal text-slate-400">
                  No passwords stored or required &middot; Australian Privacy Principles compliant.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Minimal Footer */}
      <footer className="border-t border-surface-border bg-white px-4 py-4 text-center text-xs text-slate-400">
        &copy; {new Date().getFullYear()} Australia Tech Map &middot; Evidence-backed technology opportunity intelligence.
      </footer>
    </div>
  );
}
