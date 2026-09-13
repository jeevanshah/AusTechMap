"use client";

import { ExternalLink } from "lucide-react";
import { trackEvent } from "../../../lib/analytics";

export function CareersLink({
  slug,
  careersUrl,
  className,
  label = "Careers Portal",
}: {
  slug: string;
  careersUrl: string;
  className?: string;
  label?: string;
}) {
  return (
    <a
      href={careersUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackEvent("careers_link_clicked", { slug })}
      className={
        className ??
        "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-terracotta-700 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-terracotta-800 active:scale-95 transition-all"
      }
    >
      <span>{label}</span>
      <ExternalLink className="h-3.5 w-3.5" />
    </a>
  );
}
