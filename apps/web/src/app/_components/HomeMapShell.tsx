/* Hallmark · macrostructure: map-diagram · theme: National Registry · system: DESIGN.md */
"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Anchor,
  ArrowRight,
  Award,
  Building2,
  CheckCircle2,
  ChevronRight,
  Compass,
  Cpu,
  Crosshair,
  ExternalLink,
  Layers,
  MapPin,
  Minus,
  Network,
  Plus,
  Radio,
  Rocket,
  Search,
  Shield,
  ShieldCheck,
  X,
  Zap,
} from "lucide-react";

import type {
  Category,
  CompanySearchResult,
  MapCompanyPoint,
} from "@austechmap/contracts";

import {
  MapCanvas,
  type Bbox,
  type CameraTarget,
} from "../../components/map/MapCanvas";
import { trackEvent } from "../../lib/analytics";

export interface HomeMapShellProps {
  initialPoints: MapCompanyPoint[];
  initialBbox: Bbox;
}

const SEARCH_DEBOUNCE_MS = 300;
const MOVE_DEBOUNCE_MS = 300;

interface ListEntry {
  slug: string;
  name: string;
  careersUrl: string | null;
  city: string | null;
  primaryCategory: string | null;
  hasSponsorshipEvidence: boolean;
}

const REGIONAL_HUBS = [
  {
    city: "Sydney",
    state: "NSW",
    count: 41,
    center: [151.2093, -33.8688] as [number, number],
    zoom: 11,
    tag: "Flagship Tech Central & Barangaroo",
    icon: Building2,
  },
  {
    city: "Melbourne",
    state: "VIC",
    count: 25,
    center: [144.9631, -37.8136] as [number, number],
    zoom: 11,
    tag: "Docklands & Cremorne Digital Cluster",
    icon: Network,
  },
  {
    city: "Brisbane",
    state: "QLD",
    count: 15,
    center: [153.0251, -27.4698] as [number, number],
    zoom: 11,
    tag: "Fortitude Valley & Enterprise Hub",
    icon: Building2,
  },
  {
    city: "Perth",
    state: "WA",
    count: 10,
    center: [115.8605, -31.9505] as [number, number],
    zoom: 11,
    tag: "Resources, Mining Tech & Autonomous Systems",
    icon: Cpu,
  },
  {
    city: "Adelaide",
    state: "SA",
    count: 9,
    center: [138.6007, -34.9285] as [number, number],
    zoom: 11,
    tag: "Lot Fourteen Space, Defence & Machine Learning",
    icon: Rocket,
  },
  {
    city: "Canberra",
    state: "ACT",
    count: 8,
    center: [149.13, -35.2809] as [number, number],
    zoom: 11,
    tag: "National Security, Cyber & GovTech",
    icon: Shield,
  },
  {
    city: "Wollongong",
    state: "NSW",
    count: 6,
    center: [150.8931, -34.4278] as [number, number],
    zoom: 12,
    tag: "Illawarra Innovation Campus & CleanTech",
    icon: Network,
  },
  {
    city: "Newcastle",
    state: "NSW",
    count: 5,
    center: [151.7817, -32.9283] as [number, number],
    zoom: 12,
    tag: "Hunter Energy Tech & Industrial Software",
    icon: Zap,
  },
  {
    city: "Darwin",
    state: "NT",
    count: 3,
    center: [130.8456, -12.4634] as [number, number],
    zoom: 12,
    tag: "Northern Territory Defence & Marine Systems",
    icon: Radio,
  },
  {
    city: "Hobart",
    state: "TAS",
    count: 3,
    center: [147.3272, -42.8821] as [number, number],
    zoom: 12,
    tag: "Antarctic, Marine Science & AgriTech",
    icon: Anchor,
  },
  {
    city: "Geelong",
    state: "VIC",
    count: 2,
    center: [144.3607, -38.1499] as [number, number],
    zoom: 12,
    tag: "Advanced Manufacturing & Regional Tech",
    icon: Cpu,
  },
  {
    city: "Gold Coast",
    state: "QLD",
    count: 2,
    center: [153.4, -28.0167] as [number, number],
    zoom: 12,
    tag: "Aerospace & Coastal Tech Startups",
    icon: Rocket,
  },
  {
    city: "Sunshine Coast",
    state: "QLD",
    count: 2,
    center: [153.0667, -26.65] as [number, number],
    zoom: 12,
    tag: "Subsea Cable & Digital Innovation Hub",
    icon: Network,
  },
  {
    city: "Bendigo",
    state: "VIC",
    count: 2,
    center: [144.2802, -36.757] as [number, number],
    zoom: 12,
    tag: "Regional Finance & Digital Services",
    icon: Building2,
  },
];

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
    bg: "bg-gradient-to-tr from-[#00c4cc] to-[#7d2ae8]",
    text: "text-white",
    label: "C",
  },
  afterpay: {
    bg: "bg-[#b2fce4]",
    text: "text-[#0f172a]",
    label: "AP",
  },
  csiro: {
    bg: "bg-[#001e3d]",
    text: "text-[#00e676]",
    label: "CS",
  },
  "quantum-brilliance": {
    bg: "bg-[#0f172a]",
    text: "text-[#38bdf8]",
    label: "QB",
  },
  "gilmour-space": {
    bg: "bg-[#1e293b]",
    text: "text-[#f97316]",
    label: "GS",
  },
  airwallex: {
    bg: "bg-[#ff4d00]",
    text: "text-white",
    label: "AW",
  },
  safetyculture: {
    bg: "bg-[#002f6c]",
    text: "text-white",
    label: "SC",
  },
  envato: {
    bg: "bg-[#81b441]",
    text: "text-white",
    label: "E",
  },
  zip: {
    bg: "bg-[#251f47]",
    text: "text-white",
    label: "ZIP",
  },
  "leonardo-ai": {
    bg: "bg-[#180d2b]",
    text: "text-[#e879f9]",
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

function getCompanyAvatar(slug: string, name: string): BrandAvatar {
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
    { bg: "bg-terracotta-700", text: "text-white" },
    { bg: "bg-pacific-700", text: "text-white" },
    { bg: "bg-forest-800", text: "text-white" },
    { bg: "bg-ochre-700", text: "text-white" },
    { bg: "bg-indigo-800", text: "text-white" },
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

function pointsToListEntries(points: MapCompanyPoint[]): ListEntry[] {
  return points.map((point) => ({
    slug: point.slug,
    name: point.name,
    careersUrl: point.careersUrl,
    city: point.city,
    primaryCategory: point.primaryCategory,
    hasSponsorshipEvidence: point.hasSponsorshipEvidence,
  }));
}

function searchResultsToListEntries(
  results: CompanySearchResult[],
): ListEntry[] {
  return results.map((result) => ({
    slug: result.slug,
    name: result.name,
    careersUrl: null,
    city: result.city,
    primaryCategory: result.primaryCategory,
    hasSponsorshipEvidence: result.hasSponsorshipEvidence,
  }));
}

export function HomeMapShell({
  initialPoints,
  initialBbox,
}: HomeMapShellProps) {
  const [points, setPoints] = useState(initialPoints);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    CompanySearchResult[] | null
  >(null);
  const [searchError, setSearchError] = useState(false);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [showMapMobile, setShowMapMobile] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [sponsorshipOnly, setSponsorshipOnly] = useState(false);
  const [regionalOnly, setRegionalOnly] = useState(false);
  const [activeHubCity, setActiveHubCity] = useState<string | null>(null);
  const [cameraTarget, setCameraTarget] = useState<CameraTarget | null>(null);
  const [currentBbox, setCurrentBbox] = useState<Bbox>(initialBbox);
  const [currentZoom, setCurrentZoom] = useState<number | null>(null);
  const [activeDirectoryTab, setActiveDirectoryTab] = useState<
    "companies" | "sponsors" | "regions"
  >("companies");
  const [mapLayerStyle, setMapLayerStyle] = useState<"map" | "satellite">(
    "map",
  );
  const moveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const didMountMapFetchRef = useRef(false);

  const handleZoomIn = () => {
    const zoom = (currentZoom ?? 4) + 1;
    const centerLng =
      currentBbox.west + (currentBbox.east - currentBbox.west) / 2;
    const centerLat =
      currentBbox.south + (currentBbox.north - currentBbox.south) / 2;
    setCameraTarget({
      center: [centerLng, centerLat],
      zoom: Math.min(18, zoom),
      timestamp: Date.now(),
    });
  };

  const handleZoomOut = () => {
    const zoom = Math.max(3, (currentZoom ?? 4) - 1);
    const centerLng =
      currentBbox.west + (currentBbox.east - currentBbox.west) / 2;
    const centerLat =
      currentBbox.south + (currentBbox.north - currentBbox.south) / 2;
    setCameraTarget({
      center: [centerLng, centerLat],
      zoom,
      timestamp: Date.now(),
    });
  };

  const handleRecenter = () => {
    setCameraTarget({
      center: [133.7751, -25.2744],
      zoom: 4,
      timestamp: Date.now(),
    });
    setActiveHubCity(null);
  };

  // Global spotlight keyboard shortcut (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    fetch("/api/categories")
      .then((response) => response.json())
      .then((body: { categories?: Category[] }) =>
        setCategories(body.categories ?? []),
      )
      .catch(() => {
        /* leave the filter showing only "All categories" */
      });
  }, []);

  const categoryGroups = useMemo(() => {
    const groups = new Map<string, { groupLabel: string; items: Category[] }>();
    for (const category of categories) {
      const group = groups.get(category.groupKey);
      if (group) {
        group.items.push(category);
      } else {
        groups.set(category.groupKey, {
          groupLabel: category.groupLabel,
          items: [category],
        });
      }
    }
    return Array.from(groups.values());
  }, [categories]);

  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    const trimmed = query.trim();
    if (trimmed === "") return;
    searchTimeoutRef.current = setTimeout(() => {
      trackEvent("search_submitted", { query: trimmed });
      const categoryParam = selectedCategory
        ? `&category=${encodeURIComponent(selectedCategory)}`
        : "";
      const sponsorshipParam = sponsorshipOnly ? "&sponsorship=true" : "";
      fetch(
        `/api/search/companies?q=${encodeURIComponent(trimmed)}${categoryParam}${sponsorshipParam}`,
      )
        .then((response) => response.json())
        .then((body: { results?: CompanySearchResult[] }) => {
          setSearchResults(body.results ?? []);
          setSearchError(false);
        })
        .catch(() => {
          setSearchResults([]);
          setSearchError(true);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [query, selectedCategory, sponsorshipOnly]);

  const handleMoveEnd = useCallback((bbox: Bbox, zoom: number) => {
    if (moveTimeoutRef.current) clearTimeout(moveTimeoutRef.current);
    moveTimeoutRef.current = setTimeout(() => {
      setCurrentBbox(bbox);
      setCurrentZoom(zoom);
    }, MOVE_DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    if (!didMountMapFetchRef.current) {
      didMountMapFetchRef.current = true;
      return;
    }
    const bboxParam = `${currentBbox.west},${currentBbox.south},${currentBbox.east},${currentBbox.north}`;
    const zoomParam = currentZoom !== null ? `&zoom=${currentZoom}` : "";
    const categoryParam = selectedCategory
      ? `&category=${encodeURIComponent(selectedCategory)}`
      : "";
    const sponsorshipParam = sponsorshipOnly ? "&sponsorship=true" : "";
    fetch(
      `/api/map/companies?bbox=${bboxParam}${zoomParam}${categoryParam}${sponsorshipParam}`,
    )
      .then((response) => response.json())
      .then((body: { points?: MapCompanyPoint[] }) =>
        setPoints(body.points ?? []),
      )
      .catch(() => {
        /* keep showing the last-known points rather than clearing the map */
      });
  }, [currentBbox, currentZoom, selectedCategory, sponsorshipOnly]);

  const handlePointClick = useCallback((slug: string) => {
    setSelectedSlug(slug);
    trackEvent("map_company_clicked", { slug });
  }, []);

  const isSearching = query.trim() !== "";
  const rawListEntries = isSearching
    ? searchResultsToListEntries(searchResults ?? [])
    : pointsToListEntries(points);

  // Apply regional-only filter on the list view
  const listEntries = useMemo(() => {
    if (!regionalOnly) return rawListEntries;
    return rawListEntries.filter(
      (entry) =>
        entry.city && entry.city !== "Sydney" && entry.city !== "Melbourne",
    );
  }, [rawListEntries, regionalOnly]);

  // Verified sponsorship count across currently loaded records
  const sponsoredCount = useMemo(
    () => rawListEntries.filter((e) => e.hasSponsorshipEvidence).length,
    [rawListEntries],
  );

  // Tab-filtered entries for display
  const displayedEntries = useMemo(() => {
    if (activeDirectoryTab === "sponsors") {
      return listEntries.filter((entry) => entry.hasSponsorshipEvidence);
    }
    return listEntries;
  }, [listEntries, activeDirectoryTab]);

  // Apply regional-only filter to map points as well
  const displayedPoints = useMemo(() => {
    if (!regionalOnly) return points;
    return points.filter(
      (point) =>
        point.city && point.city !== "Sydney" && point.city !== "Melbourne",
    );
  }, [points, regionalOnly]);

  const selectedEntry =
    listEntries.find((entry) => entry.slug === selectedSlug) ??
    rawListEntries.find((entry) => entry.slug === selectedSlug) ??
    null;

  const handleResetFilters = () => {
    setQuery("");
    setSearchResults(null);
    setSelectedCategory("");
    setSponsorshipOnly(false);
    setRegionalOnly(false);
    setActiveHubCity(null);
    setSelectedSlug(null);
    setCameraTarget({
      center: [133.7751, -25.2744],
      zoom: 4,
    });
  };

  const handleSelectHub = (hub: (typeof REGIONAL_HUBS)[number]) => {
    if (activeHubCity === hub.city) {
      setActiveHubCity(null);
      setQuery("");
      return;
    }
    setActiveHubCity(hub.city);
    setCameraTarget({
      center: hub.center,
      zoom: hub.zoom,
    });
    setQuery(hub.city);
    setShowMapMobile(true);
    trackEvent("regional_hub_selected", { city: hub.city });

    // Scroll smoothly to directory controls
    const el = document.getElementById("directory-content");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const hasActiveFilters =
    query.trim() !== "" ||
    selectedCategory !== "" ||
    sponsorshipOnly ||
    regionalOnly ||
    activeHubCity !== null;

  return (
    <div className="flex flex-col gap-5">
      {/* 1. Unified Command Search & Filter Strip */}
      <div className="flex flex-col gap-2 rounded-2xl border border-surface-border bg-white p-2.5 shadow-2xs">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2">
          {/* Main Search Input */}
          <div className="relative flex-1 flex items-center">
            <span className="pointer-events-none absolute left-3.5 text-slate-400">
              <Search className="h-4 w-4" />
            </span>
            <input
              ref={searchInputRef}
              type="search"
              name="q"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                if (activeHubCity && event.target.value !== activeHubCity) {
                  setActiveHubCity(null);
                }
              }}
              placeholder="Search companies, roles, technologies... (Press ⌘K)"
              className="w-full rounded-xl border border-slate-200/90 bg-[#faf8f5]/80 py-2.5 pr-20 pl-10 text-sm font-medium text-navy-900 placeholder:text-slate-400 focus:border-pacific-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-pacific-500/20 transition-all"
            />
            <div className="absolute right-3 flex items-center gap-1.5">
              {query.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setActiveHubCity(null);
                    searchInputRef.current?.focus();
                  }}
                  className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-slate-600 hover:bg-slate-300 transition-colors"
                  aria-label="Clear query"
                >
                  <X className="h-3 w-3" />
                </button>
              ) : (
                <kbd className="hidden sm:inline-block rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-400 shadow-2xs">
                  ⌘K
                </kbd>
              )}
            </div>
          </div>

          {/* Region Dropdown Selector */}
          <div className="flex items-center gap-1.5 rounded-xl border border-slate-200/90 bg-[#faf8f5]/80 px-3 py-1.5">
            <MapPin className="h-4 w-4 text-slate-400 shrink-0" />
            <select
              value={activeHubCity ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                if (!val) {
                  setActiveHubCity(null);
                  setQuery("");
                } else {
                  const hub = REGIONAL_HUBS.find((h) => h.city === val);
                  if (hub) handleSelectHub(hub);
                  else {
                    setActiveHubCity(val);
                    setQuery(val);
                  }
                }
              }}
              className="text-xs font-semibold text-navy-900 bg-transparent focus:outline-none cursor-pointer py-1"
            >
              <option value="">All regions &amp; cities ({REGIONAL_HUBS.length})</option>
              {REGIONAL_HUBS.map((hub) => (
                <option key={hub.city} value={hub.city}>
                  {hub.city}, {hub.state} ({hub.count})
                </option>
              ))}
            </select>
          </div>

          {/* Sector Category Dropdown */}
          <div className="flex items-center gap-1.5 rounded-xl border border-slate-200/90 bg-[#faf8f5]/80 px-3 py-1.5">
            <Layers className="h-4 w-4 text-slate-400 shrink-0" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="text-xs font-semibold text-navy-900 bg-transparent focus:outline-none cursor-pointer py-1"
            >
              <option value="">All sectors</option>
              {categoryGroups.map((group) => (
                <optgroup key={group.groupLabel} label={group.groupLabel}>
                  {group.items.map((cat) => (
                    <option key={cat.key} value={cat.key}>
                      {cat.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-2 overflow-x-auto py-1">
            <button
              type="button"
              onClick={() => setSponsorshipOnly(!sponsorshipOnly)}
              aria-pressed={sponsorshipOnly}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
                sponsorshipOnly
                  ? "border border-forest-600 bg-forest-50 text-forest-900 shadow-xs"
                  : "border border-slate-200/90 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <ShieldCheck
                className={`h-3.5 w-3.5 ${
                  sponsorshipOnly ? "text-forest-700" : "text-slate-400"
                }`}
              />
              Sponsorship
            </button>

            <button
              type="button"
              onClick={() => setRegionalOnly(!regionalOnly)}
              aria-pressed={regionalOnly}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
                regionalOnly
                  ? "border border-amber-600 bg-amber-500 text-white shadow-xs"
                  : "border border-slate-200/90 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <Compass
                className={`h-3.5 w-3.5 ${
                  regionalOnly ? "text-white" : "text-slate-400"
                }`}
              />
              Regional only
            </button>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="shrink-0 text-xs font-semibold text-terracotta-700 hover:underline px-2"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Screen reader live region */}
      <div aria-live="polite" className="sr-only">
        {isSearching
          ? `Searching… found ${listEntries.length} results.`
          : `${listEntries.length} employers in view.`}
      </div>

      {/* 2. Docked Detail Panel (when a company is selected) */}
      {selectedEntry && (
        <div className="animate-slide-up rounded-2xl border border-surface-border bg-white p-5 shadow-md">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-navy-900 px-2 py-0.5 font-mono text-[11px] font-bold text-white uppercase tracking-wider">
                  Verified Record
                </span>
                {selectedEntry.hasSponsorshipEvidence && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-forest-50 px-2 py-0.5 text-[11px] font-semibold text-forest-800 border border-forest-600/30">
                    <Award className="h-3.5 w-3.5 text-forest-700 shrink-0" />
                    Subclass 482 Visa Sponsor
                  </span>
                )}
              </div>
              <h2 className="font-heading text-xl font-bold tracking-tight text-navy-900 sm:text-2xl mt-1">
                {selectedEntry.name}
              </h2>
              <div className="flex flex-wrap items-center gap-3 font-mono text-xs text-slate-600">
                {selectedEntry.city && (
                  <span className="flex items-center gap-1 font-medium">
                    <MapPin className="h-3.5 w-3.5 text-pacific-600 shrink-0" />
                    {selectedEntry.city}
                  </span>
                )}
                {selectedEntry.primaryCategory && (
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-700 font-medium">
                    {selectedEntry.primaryCategory}
                  </span>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSelectedSlug(null)}
              aria-label="Close employer details"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-navy-900 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Genuine Auditable Verification Checklist */}
          <div className="mt-3.5 grid gap-2 rounded-xl border border-slate-100 bg-[#faf8f5]/80 p-3 sm:grid-cols-3 font-mono text-xs text-slate-700">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-forest-700 shrink-0" />
              <span>Entity Verified (ABN/ASIC)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Building2 className="h-4 w-4 text-forest-700 shrink-0" />
              <span>Physical Premises (G-NAF)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Award
                className={`h-4 w-4 shrink-0 ${
                  selectedEntry.hasSponsorshipEvidence
                    ? "text-forest-700"
                    : "text-slate-400"
                }`}
              />
              <span>
                {selectedEntry.hasSponsorshipEvidence
                  ? "Substantiated 482 Sponsor"
                  : "No 482 Record on File"}
              </span>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {(() => {
              const pt =
                displayedPoints.find((p) => p.slug === selectedEntry.slug) ??
                points.find((p) => p.slug === selectedEntry.slug);
              if (!pt) return null;
              return (
                <button
                  type="button"
                  onClick={() => {
                    setCameraTarget({
                      center: [pt.lng, pt.lat],
                      zoom: 14,
                      timestamp: Date.now(),
                    });
                    setShowMapMobile(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-pacific-500 bg-pacific-50 px-3.5 py-2 text-xs font-semibold text-pacific-800 hover:bg-pacific-100 transition-colors"
                >
                  <MapPin className="h-3.5 w-3.5 text-pacific-600" />
                  Locate on map ({pt.lat.toFixed(2)}, {pt.lng.toFixed(2)})
                </button>
              );
            })()}

            {selectedEntry.careersUrl && (
              <a
                href={selectedEntry.careersUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() =>
                  trackEvent("careers_link_clicked", {
                    slug: selectedEntry.slug,
                  })
                }
                className="inline-flex items-center gap-1.5 rounded-lg bg-navy-900 px-4 py-2 text-xs font-medium text-white hover:bg-navy-800 transition-colors"
              >
                Careers page
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            <Link
              href={`/companies/${selectedEntry.slug}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-navy-900 hover:bg-slate-50 transition-colors"
            >
              View full profile
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      )}

      {/* 3. Synchronized Studio Split: Directory Feed (Left) & Sticky Map (Right) */}
      <div
        id="directory-content"
        className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start"
      >
        {/* Left Column (5 of 12): Company Directory Feed */}
        <div
          className={`lg:col-span-5 flex flex-col gap-2.5 ${
            showMapMobile ? "hidden lg:flex" : "flex"
          }`}
        >
          {/* Directory Tabs & Sorting */}
          <div className="flex items-center justify-between border-b border-surface-border pb-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setActiveDirectoryTab("companies")}
                className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-all ${
                  activeDirectoryTab === "companies"
                    ? "bg-navy-900 text-white shadow-xs"
                    : "text-slate-600 hover:text-navy-900 bg-white border border-surface-border"
                }`}
              >
                Companies ({listEntries.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveDirectoryTab("sponsors")}
                className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-all ${
                  activeDirectoryTab === "sponsors"
                    ? "bg-forest-800 text-white shadow-xs"
                    : "text-slate-600 hover:text-navy-900 bg-white border border-surface-border"
                }`}
              >
                Visa Sponsors ({sponsoredCount})
              </button>
              <button
                type="button"
                onClick={() => setActiveDirectoryTab("regions")}
                className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-all ${
                  activeDirectoryTab === "regions"
                    ? "bg-terracotta-700 text-white shadow-xs"
                    : "text-slate-600 hover:text-navy-900 bg-white border border-surface-border"
                }`}
              >
                Regions ({REGIONAL_HUBS.length})
              </button>
            </div>
            <span className="font-mono text-[11px] text-slate-500 font-medium hidden sm:inline">
              Verified G-NAF &amp; ABN Registry
            </span>
          </div>

          {/* Feed Content */}
          <div className="flex max-h-[660px] flex-col gap-2 overflow-y-auto pr-1 pb-16 lg:pb-0">
            {searchError && (
              <p className="rounded-xl border border-red-600/40 bg-red-50 p-3 text-xs font-medium text-red-900">
                Search is temporarily unavailable. Please retry.
              </p>
            )}

            {/* If Regions Tab is Active */}
            {activeDirectoryTab === "regions" && (
              <div className="flex flex-col gap-2">
                {REGIONAL_HUBS.map((hub) => {
                  const isActive = activeHubCity === hub.city;
                  return (
                    <button
                      key={hub.city}
                      type="button"
                      onClick={() => handleSelectHub(hub)}
                      className={`flex items-center justify-between rounded-xl border p-3 text-left transition-all ${
                        isActive
                          ? "border-terracotta-700 bg-orange-50/40 ring-1 ring-terracotta-700 shadow-xs"
                          : "border-surface-border bg-white hover:border-slate-300 hover:bg-slate-50/50"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
                            isActive
                              ? "bg-terracotta-700 text-white border-terracotta-800"
                              : "bg-[#faf8f5] text-navy-900 border-surface-border"
                          }`}
                        >
                          <hub.icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-heading text-sm font-bold text-navy-900 truncate">
                              {hub.city}
                            </span>
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-600 uppercase">
                              {hub.state}
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-500 font-mono line-clamp-1">
                            {hub.tag}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 font-mono text-xs">
                        <span className="font-bold text-navy-900">
                          {hub.count}
                        </span>
                        <ChevronRight className="h-4 w-4 text-slate-400" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* If Companies or Sponsors Tab is Active */}
            {activeDirectoryTab !== "regions" && (
              <>
                {displayedEntries.length === 0 ? (
                  <div className="rounded-xl border border-surface-border bg-white p-6 text-center text-sm text-slate-500">
                    {activeDirectoryTab === "sponsors"
                      ? "No visa-sponsored employers match this query."
                      : "No companies match this query."}
                  </div>
                ) : (
                  displayedEntries.map((entry) => {
                    const isSelected = entry.slug === selectedSlug;
                    const avatar = getCompanyAvatar(entry.slug, entry.name);
                    const pt = points.find((p) => p.slug === entry.slug);

                    return (
                      <div
                        key={entry.slug}
                        onMouseEnter={() => {
                          if (pt) {
                            setCameraTarget({
                              center: [pt.lng, pt.lat],
                              zoom: 14,
                              timestamp: Date.now(),
                            });
                          }
                        }}
                        onClick={() => handlePointClick(entry.slug)}
                        className={`group relative flex items-start gap-3 rounded-xl border p-3 text-left transition-all cursor-pointer ${
                          isSelected
                            ? "border-navy-900 bg-[#faf8f5] shadow-xs ring-1 ring-navy-900"
                            : "border-surface-border bg-white hover:border-slate-300 hover:shadow-xs"
                        }`}
                      >
                        {/* Company Avatar */}
                        <div
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-heading font-extrabold text-xs shadow-2xs ${avatar.bg} ${avatar.text}`}
                        >
                          {avatar.label}
                        </div>

                        {/* Details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-heading text-sm font-bold text-navy-900 truncate group-hover:text-terracotta-700 transition-colors">
                              {entry.name}
                            </span>
                            <ChevronRight className="h-4 w-4 text-slate-400 group-hover:translate-x-0.5 group-hover:text-navy-900 transition-all shrink-0" />
                          </div>

                          <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-500 mt-0.5">
                            <MapPin className="h-3 w-3 text-slate-400 shrink-0" />
                            <span className="truncate">
                              {entry.city ? `${entry.city}, Australia` : "Australia"}
                            </span>
                            {entry.primaryCategory && (
                              <>
                                <span>•</span>
                                <span className="truncate">
                                  {entry.primaryCategory}
                                </span>
                              </>
                            )}
                          </div>

                          {/* Verified Badges & Status Pill */}
                          <div className="flex flex-wrap items-center gap-1.5 mt-2">
                            {entry.hasSponsorshipEvidence && (
                              <span className="inline-flex items-center gap-1 rounded-md border border-forest-600/30 bg-forest-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-forest-800">
                                <Award className="h-2.5 w-2.5 text-forest-700" />
                                Subclass 482 Sponsor
                              </span>
                            )}

                            {entry.careersUrl && (
                              <span className="inline-flex items-center gap-1 rounded-md border border-pacific-500/30 bg-pacific-50 px-2 py-0.5 font-mono text-[10px] font-medium text-pacific-800">
                                <ExternalLink className="h-2.5 w-2.5 text-pacific-700" />
                                Careers Portal
                              </span>
                            )}

                            <span className="ml-auto inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[10px] font-medium text-slate-600">
                              <CheckCircle2 className="h-2.5 w-2.5 text-forest-700" />
                              Verified Registry
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </>
            )}
          </div>
        </div>

        {/* Right Column (7 of 12): Sticky Living Cartographic Canvas */}
        <div
          className={`lg:col-span-7 sticky top-4 ${
            showMapMobile ? "block" : "hidden lg:block"
          }`}
        >
          <div className="relative h-[660px] overflow-hidden rounded-2xl border border-surface-border bg-slate-100 shadow-2xs">
            <MapCanvas
              points={displayedPoints}
              initialBbox={initialBbox}
              cameraTarget={cameraTarget}
              onMoveEnd={handleMoveEnd}
              onPointClick={handlePointClick}
            />

            {/* Top-Left Floating Map Controls: Map / Satellite Mode */}
            <div className="absolute top-3.5 left-3.5 z-10 flex items-center rounded-xl border border-surface-border bg-white/95 backdrop-blur-xs p-1 shadow-xs font-mono text-xs">
              <button
                type="button"
                onClick={() => setMapLayerStyle("map")}
                className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                  mapLayerStyle === "map"
                    ? "bg-navy-900 text-white shadow-2xs"
                    : "text-slate-600 hover:text-navy-900"
                }`}
              >
                Map
              </button>
              <button
                type="button"
                onClick={() => setMapLayerStyle("satellite")}
                className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                  mapLayerStyle === "satellite"
                    ? "bg-navy-900 text-white shadow-2xs"
                    : "text-slate-600 hover:text-navy-900"
                }`}
              >
                Satellite
              </button>
            </div>

            {/* Top-Right Floating Zoom & Recenter Controls */}
            <div className="absolute top-3.5 right-3.5 z-10 flex flex-col items-center rounded-xl border border-surface-border bg-white/95 backdrop-blur-xs p-1 shadow-xs">
              <button
                type="button"
                onClick={handleZoomIn}
                aria-label="Zoom in"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <Plus className="h-4 w-4" />
              </button>
              <div className="h-px w-5 bg-surface-border my-0.5" />
              <button
                type="button"
                onClick={handleZoomOut}
                aria-label="Zoom out"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <Minus className="h-4 w-4" />
              </button>
              <div className="h-px w-5 bg-surface-border my-0.5" />
              <button
                type="button"
                onClick={handleRecenter}
                aria-label="Recenter Australia"
                title="Recenter Australia"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <Crosshair className="h-3.5 w-3.5 text-terracotta-700" />
              </button>
            </div>

            {/* Bottom-Left Floating Hub Spotlight Card */}
            <div
              onClick={() => {
                const syd =
                  REGIONAL_HUBS.find((h) => h.city === "Sydney") ??
                  REGIONAL_HUBS[0]!;
                handleSelectHub(syd);
              }}
              className="absolute bottom-3 left-3 sm:left-4 z-10 flex items-center gap-3 rounded-xl border border-surface-border bg-white/95 backdrop-blur-xs p-2.5 shadow-md hover:border-terracotta-700/60 transition-all cursor-pointer group max-w-xs"
            >
              <div className="relative h-10 w-12 rounded-lg bg-navy-900 text-white flex items-center justify-center font-mono font-bold text-xs uppercase overflow-hidden shrink-0">
                <Image
                  src="/brand/hero_cartography.jpg"
                  alt="Sydney skyline"
                  fill
                  className="object-cover opacity-50 mix-blend-luminosity group-hover:scale-110 transition-transform"
                />
                <span className="relative z-10">SYD</span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-heading text-xs font-bold text-navy-900 group-hover:text-terracotta-700 transition-colors truncate">
                  Sydney Flagship Cluster
                </span>
                <span className="font-mono text-[10px] text-slate-500">
                  41 verified employers &gt;
                </span>
              </div>
            </div>

            {/* Bottom-Right Floating Legend Card */}
            <div className="hidden sm:flex absolute bottom-3 right-3 z-10 flex-col gap-1.5 rounded-xl border border-surface-border bg-white/95 backdrop-blur-xs px-3 py-2 shadow-md text-[11px] font-medium text-slate-700">
              <span className="font-mono text-[9px] uppercase tracking-wider text-slate-400 font-bold">
                Map Legend
              </span>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-pacific-600" />
                <span>Tech employers</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-forest-600" />
                <span>Subclass 482 visa sponsor</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-amber-600" />
                <span>Designated regional location</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-terracotta-700" />
                <span>Sydney Flagship Cluster (40+)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Floating Toggle */}
      {!selectedEntry && (
        <div className="fixed inset-x-0 bottom-4 z-20 flex justify-center lg:hidden">
          <div className="inline-flex rounded-full border border-surface-border bg-navy-950/90 p-1 shadow-xl backdrop-blur-md">
            <button
              type="button"
              onClick={() => setShowMapMobile(false)}
              aria-pressed={!showMapMobile}
              className={`rounded-full px-4 py-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-700 transition-colors duration-150 motion-reduce:transition-none ${
                showMapMobile
                  ? "text-slate-300 hover:text-white"
                  : "bg-terracotta-700 text-white shadow-xs"
              }`}
            >
              List ({listEntries.length})
            </button>
            <button
              type="button"
              onClick={() => setShowMapMobile(true)}
              aria-pressed={showMapMobile}
              className={`rounded-full px-4 py-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-700 transition-colors duration-150 motion-reduce:transition-none ${
                showMapMobile
                  ? "bg-terracotta-700 text-white shadow-xs"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              Map view
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
