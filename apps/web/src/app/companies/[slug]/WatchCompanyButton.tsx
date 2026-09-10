"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, BookmarkCheck, Loader2 } from "lucide-react";

import { toggleCompanyWatchAction } from "../../actions/retentionActions";

interface WatchCompanyButtonProps {
  companyId: string;
  companySlug: string;
  initialWatching: boolean;
  isSignedIn: boolean;
}

export function WatchCompanyButton({
  companyId,
  companySlug,
  initialWatching,
  isSignedIn,
}: WatchCompanyButtonProps) {
  const router = useRouter();
  const [isWatching, setIsWatching] = useState<boolean>(initialWatching);
  const [isPending, startTransition] = useTransition();

  const handleToggle = () => {
    if (!isSignedIn) {
      router.push(`/sign-in?callbackUrl=/companies/${companySlug}`);
      return;
    }

    startTransition(async () => {
      // Optimistic update
      setIsWatching((prev) => !prev);
      const res = await toggleCompanyWatchAction(companyId);
      if (res.success && res.watching !== undefined) {
        setIsWatching(res.watching);
      } else {
        // Revert on error
        setIsWatching(initialWatching);
      }
    });
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={isPending}
      title={
        isWatching
          ? "Stop watching this employer"
          : "Watch for hiring & sponsorship updates"
      }
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold shadow-2xs transition-all ${
        isWatching
          ? "border border-terracotta-200 bg-terracotta-50 text-terracotta-800 hover:bg-terracotta-100/80"
          : "border border-surface-border bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
      }`}
    >
      {isPending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
      ) : isWatching ? (
        <BookmarkCheck className="h-3.5 w-3.5 text-terracotta-700" />
      ) : (
        <Bookmark className="h-3.5 w-3.5 text-slate-400" />
      )}
      <span>{isWatching ? "Watching" : "Watch Employer"}</span>
    </button>
  );
}
