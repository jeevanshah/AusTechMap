"use client";

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
      className="rounded-md bg-navy-900 px-4 py-2 text-xs font-medium text-white transition hover:bg-navy-800"
    >
      Careers page ↗
    </a>
  );
}
