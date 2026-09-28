"use client";

import { Bookmark, Check, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

import { saveJobApplicationAction } from "../../app/actions/applicationActions";

interface SaveJobButtonProps {
  jobId: string;
  initiallySaved: boolean;
  signedIn: boolean;
}

export function SaveJobButton({
  jobId,
  initiallySaved,
  signedIn,
}: SaveJobButtonProps) {
  const [saved, setSaved] = useState(initiallySaved);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!signedIn) {
    return (
      <Link
        href="/sign-in?callbackUrl=/jobs"
        className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-xs transition-colors hover:bg-slate-50"
      >
        <Bookmark className="h-3.5 w-3.5" />
        Save
      </Link>
    );
  }

  if (saved) {
    return (
      <Link
        href="/account"
        className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 transition-colors hover:bg-emerald-100"
      >
        <Check className="h-3.5 w-3.5" />
        In Job Vault
      </Link>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        disabled={isPending}
        aria-describedby={error ? `save-job-error-${jobId}` : undefined}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await saveJobApplicationAction(jobId);
            if (result.success) setSaved(true);
            else setError(result.error ?? "Could not save this job");
          });
        }}
        className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-xs transition-colors hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
      >
        {isPending ? (
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Bookmark className="h-3.5 w-3.5" />
        )}
        {isPending ? "Saving…" : "Save"}
      </button>
      {error && (
        <p
          id={`save-job-error-${jobId}`}
          role="alert"
          className="absolute right-0 top-full z-10 mt-1 w-56 rounded-lg border border-red-200 bg-red-50 p-2 text-[11px] font-medium text-red-800 shadow-sm"
        >
          {error}
        </p>
      )}
    </div>
  );
}
