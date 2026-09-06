"use client";

import { ExternalLink } from "lucide-react";
import { trackEvent } from "../../../lib/analytics";

export function CareersLink({
  slug,
  careersUrl,
}: {
  slug: string;
  careersUrl: string;
}) {
  return (
    <a
      href={careersUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackEvent("careers_link_clicked", { slug })}
      className="inline-flex items-center gap-1.5 rounded-md bg-navy-900 px-4 py-2 text-xs font-medium text-white transition-colors duration-150 motion-reduce:transition-none hover:bg-navy-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre-600 focus-visible:ring-offset-2"
    >
      <span>Careers page</span>
      <ExternalLink className="h-3.5 w-3.5 text-slate-300" />
    </a>
  );
}
