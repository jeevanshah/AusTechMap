"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, BookmarkCheck, Loader2 } from "lucide-react";

import { toggleRegionWatchAction } from "../../actions/retentionActions";

interface WatchRegionButtonProps {
  sa4Code: string;
  regionName: string;
  initialWatching: boolean;
  isSignedIn: boolean;
}

export function WatchRegionButton({
  sa4Code,
  regionName,
  initialWatching,
  isSignedIn,
}: WatchRegionButtonProps) {
  const router = useRouter();
  const [isWatching, setIsWatching] = useState<boolean>(initialWatching);
  const [isPending, startTransition] = useTransition();

  const handleToggle = () => {
    if (!isSignedIn) {
      router.push(`/sign-in?callbackUrl=/regions/${sa4Code}`);
      return;
    }

    startTransition(async () => {
      setIsWatching((prev) => !prev);
      const res = await toggleRegionWatchAction(sa4Code);
      if (res.success && res.watching !== undefined) {
        setIsWatching(res.watching);
      } else {
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
          ? `Stop watching ${regionName}`
          : `Watch ${regionName} for tech & labour updates`
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
      <span>{isWatching ? "Watching Region" : "Watch Region"}</span>
    </button>
  );
}
