"use client";

import { FileUp, LoaderCircle, Sparkles } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import type { CandidateProfileSuggestion } from "@austechmap/contracts";

import {
  ResumeReadError,
  suggestFromResume,
  type ResumeTaxonomy,
} from "../../lib/profile/extractSuggestion";

interface ResumeIntakeCardProps {
  hasExistingProfile: boolean;
  taxonomy: ResumeTaxonomy;
  onParsed: (suggestion: CandidateProfileSuggestion) => void;
}

export function ResumeIntakeCard({
  hasExistingProfile,
  taxonomy,
  onParsed,
}: ResumeIntakeCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const resetInput = () => {
    // Clearing the value lets the user pick the same file again after fixing
    // the problem; the ref is null if a successful read already unmounted us.
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleFile = (file: File) => {
    setError(null);
    startTransition(async () => {
      try {
        onParsed(await suggestFromResume(file, taxonomy));
      } catch (readError) {
        setError(
          readError instanceof ResumeReadError
            ? readError.message
            : "We couldn't read that file. Please try again.",
        );
      } finally {
        resetInput();
      }
    });
  };

  return (
    <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-2xs">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-terracotta-50 p-2">
          <Sparkles className="h-4 w-4 text-terracotta-700" />
        </div>
        <div className="min-w-0">
          <h3 className="font-heading text-sm font-bold text-navy-900">
            {hasExistingProfile
              ? "Update from a new resume"
              : "Analyse my CV to pre-fill these preferences"}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            Choose a PDF resume and we&apos;ll suggest your role, skills, and
            experience level for you to confirm. The file is read in your
            browser and is never uploaded to us.
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        disabled={isPending}
        className="peer sr-only"
        id="resume-upload-input"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
      <label
        htmlFor="resume-upload-input"
        className={`mt-3 inline-flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-navy-900 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-slate-800 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-navy-900 ${
          isPending ? "pointer-events-none opacity-60" : ""
        }`}
      >
        {isPending ? (
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <FileUp className="h-3.5 w-3.5" />
        )}
        {isPending ? "Reading…" : "Analyse my CV"}
      </label>

      {error && (
        <p
          role="alert"
          className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-[11px] font-medium text-red-800"
        >
          {error}
        </p>
      )}
    </div>
  );
}
