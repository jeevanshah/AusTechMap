"use client";

import { useMemo, useState } from "react";

interface BrandAvatar {
  bg: string;
  text: string;
  label: string;
}

const BRAND_METADATA: Record<string, BrandAvatar> = {
  atlassian: {
    bg: "bg-[#0052cc]",
    text: "text-white",
    label: "A",
  },
  canva: {
    bg: "bg-[#00c4cc]",
    text: "text-white",
    label: "C",
  },
  afterpay: {
    bg: "bg-[#b2fce4]",
    text: "text-black",
    label: "AP",
  },
  airwallex: {
    bg: "bg-[#fd5100]",
    text: "text-white",
    label: "AW",
  },
  safetyculture: {
    bg: "bg-[#e83f5b]",
    text: "text-white",
    label: "SC",
  },
  "gilmour-space": {
    bg: "bg-[#0b132b]",
    text: "text-white",
    label: "GS",
  },
  "quantum-brilliance": {
    bg: "bg-[#1c2541]",
    text: "text-white",
    label: "QB",
  },
  sitemate: {
    bg: "bg-[#3a0ca3]",
    text: "text-white",
    label: "SM",
  },
  accelo: {
    bg: "bg-[#2ec4b6]",
    text: "text-white",
    label: "AC",
  },
  "leonardo-ai": {
    bg: "bg-[#111827]",
    text: "text-white",
    label: "L",
  },
  "culture-amp": {
    bg: "bg-[#242424]",
    text: "text-[#ff6079]",
    label: "CA",
  },
  iress: {
    bg: "bg-[#002f6c]",
    text: "text-white",
    label: "IR",
  },
  "mineral-resources-tech-minres": {
    bg: "bg-[#1e3a8a]",
    text: "text-white",
    label: "MR",
  },
};

const KNOWN_DOMAINS: Record<string, string> = {
  sitemate: "sitemate.com",
  accelo: "accelo.com",
  atlassian: "atlassian.com",
  canva: "canva.com",
  afterpay: "afterpay.com",
  airwallex: "airwallex.com",
  safetyculture: "safetyculture.com",
  "culture-amp": "cultureamp.com",
  "mineral-resources-tech-minres": "mineralresources.com.au",
  csiro: "csiro.au",
  "csiro-data61": "data61.csiro.au",
  "quantum-brilliance": "quantumbrilliance.com",
  "gilmour-space": "gspacetech.com",
  zip: "zip.co",
  envato: "envato.com",
  "leonardo-ai": "leonardo.ai",
  iress: "iress.com",
  wooliesx: "wooliesx.com.au",
  "up-ferocia": "up.com.au",
  "wisetech-global": "wisetechglobal.com",
};

export function extractDomainFromUrl(
  url: string | null | undefined,
  slug: string,
): string {
  if (KNOWN_DOMAINS[slug]) {
    return KNOWN_DOMAINS[slug]!;
  }
  if (url) {
    try {
      const u = new URL(url);
      const host = u.hostname.toLowerCase().replace(/^www\./, "");
      if (
        !host.includes("lever.co") &&
        !host.includes("greenhouse.io") &&
        !host.includes("workable.com") &&
        !host.includes("bamboohr.com") &&
        !host.includes("ashbyhq.com")
      ) {
        return host;
      }
    } catch {
      // fallback
    }
  }
  return `${slug}.com`;
}

export function getCompanyAvatar(slug: string, name: string): BrandAvatar {
  if (BRAND_METADATA[slug]) {
    return BRAND_METADATA[slug];
  }
  const clean = name.trim();
  const initials =
    clean
      .split(/\s+/)
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "AU";
  const colors = [
    { bg: "bg-navy-900", text: "text-white" },
    { bg: "bg-slate-800", text: "text-white" },
    { bg: "bg-terracotta-800", text: "text-white" },
    { bg: "bg-emerald-800", text: "text-white" },
  ];
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = (hash * 31 + slug.charCodeAt(i)) | 0;
  }
  const picked = colors[Math.abs(hash) % colors.length] ?? colors[0]!;
  return {
    bg: picked.bg,
    text: picked.text,
    label: initials,
  };
}

export interface CompanyBrandMarkProps {
  slug?: string | null;
  name: string;
  domain?: string | null;
  careersUrl?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

export function CompanyBrandMark({
  slug,
  name,
  domain,
  careersUrl,
  size = "md",
  className = "",
}: CompanyBrandMarkProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const resolvedSlug =
    slug || (name ? name.toLowerCase().replace(/[^a-z0-9]+/g, "-") : "unknown");
  const avatar = getCompanyAvatar(resolvedSlug, name || "AU");
  const resolvedDomain = useMemo(
    () => domain || extractDomainFromUrl(careersUrl, resolvedSlug),
    [domain, careersUrl, resolvedSlug],
  );

  const sizeClasses = {
    sm: "h-8 w-8 rounded-lg text-xs",
    md: "h-10 w-10 rounded-xl text-xs",
    lg: "h-12 w-12 rounded-xl text-sm font-bold",
    xl: "h-16 w-16 rounded-2xl text-lg font-black",
  }[size];

  const logoUrl =
    resolvedDomain && !imgFailed
      ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(resolvedDomain)}&sz=128`
      : null;

  return (
    <div
      suppressHydrationWarning
      className={`relative flex shrink-0 items-center justify-center overflow-hidden border border-slate-200/90 bg-white shadow-2xs ${sizeClasses} ${className}`}
    >
      {logoUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={logoUrl}
          alt={`${name} logo`}
          loading="lazy"
          suppressHydrationWarning
          className="h-full w-full object-contain p-1.5"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <div
          suppressHydrationWarning
          className={`flex h-full w-full items-center justify-center font-heading font-black ${avatar.bg} ${avatar.text}`}
        >
          {avatar.label}
        </div>
      )}
    </div>
  );
}
