import Image from "next/image";
import Link from "next/link";
import { MailCheck, ArrowLeft, Clock, ShieldCheck, RefreshCw } from "lucide-react";

export default function VerifyRequestPage() {
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

      {/* Main Content */}
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full rounded-2xl border border-surface-border bg-white p-6 shadow-sm sm:p-8 text-center">
          {/* Dispatch Icon */}
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-forest-50 border border-forest-200 text-forest-600 mb-6">
            <MailCheck className="h-7 w-7" />
          </div>

          <div className="inline-flex items-center gap-1.5 rounded-full border border-forest-200 bg-forest-50 px-3 py-1 text-xs font-semibold text-forest-700 mb-3">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Secure Link Dispatched</span>
          </div>

          <h1 className="font-heading text-2xl font-bold tracking-tight text-navy-950">
            Check your email inbox
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            We&apos;ve sent a one-time sign-in link to your email address. Click the link in the message to access your account immediately.
          </p>

          {/* Security guidance card */}
          <div className="mt-6 rounded-xl bg-slate-50 border border-slate-200/80 p-4 text-left flex flex-col gap-2.5">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-700">
              <Clock className="h-3.5 w-3.5 text-ochre-600 shrink-0" />
              <span>Valid for 10 minutes from receipt</span>
            </div>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-700">
              <ShieldCheck className="h-3.5 w-3.5 text-forest-600 shrink-0" />
              <span>Single-use link with zero stored credentials</span>
            </div>
            <p className="text-[11px] text-slate-500 pt-1 border-t border-slate-200/60">
              Didn&apos;t receive it? Check your spam or promotions folder, or allow a minute for network transit.
            </p>
          </div>

          {/* Actions */}
          <div className="mt-6 flex flex-col gap-2.5">
            <Link
              href="/sign-in"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-2xs hover:bg-slate-50 hover:border-slate-300 transition-colors cursor-pointer"
            >
              <RefreshCw className="h-4 w-4 text-slate-500" />
              <span>Try another sign-in method</span>
            </Link>

            <Link
              href="/"
              className="inline-flex w-full items-center justify-center px-4 py-2 text-xs font-medium text-slate-500 hover:text-navy-900 transition-colors"
            >
              Return to Map Explorer
            </Link>
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
