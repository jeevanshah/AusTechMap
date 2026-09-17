"use client";

import { useTransition, useState } from "react";
import { Mail, ArrowRight, Loader2 } from "lucide-react";
import { requestMagicLink } from "./actions";

interface MagicLinkFormProps {
  callbackUrl?: string;
}

export function MagicLinkForm({ callbackUrl = "/account" }: MagicLinkFormProps) {
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!email.trim()) return;

    const formData = new FormData();
    formData.append("email", email.trim());
    formData.append("callbackUrl", callbackUrl);

    startTransition(async () => {
      await requestMagicLink(formData);
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="email-input"
          className="text-xs font-semibold uppercase tracking-wider text-slate-700"
        >
          Work or Personal Email
        </label>
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
            <Mail className="h-4 w-4" />
          </div>
          <input
            id="email-input"
            type="email"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="name@company.com.au"
            disabled={isPending}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-terracotta-600 focus:outline-none focus:ring-2 focus:ring-terracotta-500/20 disabled:cursor-not-allowed disabled:bg-slate-50 transition-colors shadow-2xs"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={isPending || !email.trim()}
        className="group relative flex w-full items-center justify-center gap-2 rounded-xl bg-terracotta-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition-all duration-150 hover:bg-terracotta-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-600 cursor-pointer"
      >
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Sending secure link...</span>
          </>
        ) : (
          <>
            <span>Send magic link</span>
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </>
        )}
      </button>

      <p className="text-center text-xs text-slate-500">
        We will email a one-time sign-in link valid for 10 minutes.
      </p>
    </form>
  );
}
