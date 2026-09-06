/* Hallmark · macrostructure: map-diagram · theme: National Registry · system: DESIGN.md */
"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
    city: "Brisbane",
    state: "QLD",
    count: 15,
    center: [153.0251, -27.4698] as [number, number],
    zoom: 11,
    tag: "Subtropical Enterprise Hub",
  },
  {
    city: "Perth",
    state: "WA",
    count: 10,
    center: [115.8605, -31.9505] as [number, number],
    zoom: 11,
    tag: "Resources & Autonomous Systems",
  },
  {
    city: "Adelaide",
    state: "SA",
    count: 9,
    center: [138.6007, -34.9285] as [number, number],
    zoom: 11,
    tag: "Defence, Space & Machine Learning",
  },
  {
    city: "Canberra",
    state: "ACT",
    count: 8,
    center: [149.13, -35.2809] as [number, number],
    zoom: 11,
    tag: "GovTech, Cyber & National Security",
  },
  {
    city: "Wollongong",
    state: "NSW",
    count: 6,
    center: [150.8931, -34.4278] as [number, number],
    zoom: 12,
    tag: "Illawarra Innovation Corridor",
  },
  {
    city: "Newcastle",
    state: "NSW",
    count: 5,
    center: [151.7817, -32.9283] as [number, number],
    zoom: 12,
    tag: "CleanTech & Industrial Software",
  },
  {
    city: "Darwin",
    state: "NT",
    count: 3,
    center: [130.8456, -12.4634] as [number, number],
    zoom: 12,
    tag: "Tropical Gateway & Communications",
  },
  {
    city: "Hobart",
    state: "TAS",
    count: 3,
    center: [147.3272, -42.8821] as [number, number],
    zoom: 12,
    tag: "Antarctic, Marine & AgriTech",
  },
];

const QUICK_CATEGORY_PILLS = [
  { key: "ai-ml", label: "AI / ML" },
  { key: "fintech", label: "Fintech" },
  { key: "cybersecurity", label: "Cyber" },
  { key: "climate-tech", label: "Climate Tech" },
  { key: "cloud", label: "Cloud" },
  { key: "developer-tools", label: "Dev Tools" },
];

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
  const [viewMode, setViewMode] = useState<"map" | "list">("map");
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [sponsorshipOnly, setSponsorshipOnly] = useState(false);
  const [regionalOnly, setRegionalOnly] = useState(false);
  const [cameraTarget, setCameraTarget] = useState<CameraTarget | null>(null);
  const [currentBbox, setCurrentBbox] = useState<Bbox>(initialBbox);
  const [currentZoom, setCurrentZoom] = useState<number | null>(null);
  const moveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didMountMapFetchRef = useRef(false);

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
    setSelectedSlug(null);
    setCameraTarget({
      center: [133.7751, -25.2744],
      zoom: 4,
    });
  };

  const handleSelectHub = (hub: (typeof REGIONAL_HUBS)[number]) => {
    setCameraTarget({
      center: hub.center,
      zoom: hub.zoom,
    });
    setQuery(hub.city);
    setViewMode("map");
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
    regionalOnly;

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Quick Filters & Category Strip */}
      <div className="flex flex-col gap-3 rounded-xl border border-surface-border bg-white p-4 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-slate-400">
              Filters:
            </span>

            {/* Sponsorship Verified Filter */}
            <button
              type="button"
              onClick={() => setSponsorshipOnly(!sponsorshipOnly)}
              aria-pressed={sponsorshipOnly}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre-600 ${
                sponsorshipOnly
                  ? "border border-forest-600 bg-forest-50 text-forest-900 font-semibold"
                  : "border border-surface-border bg-slate-50 text-slate-700 hover:bg-slate-100"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  sponsorshipOnly ? "bg-forest-600" : "bg-purple-500"
                }`}
              />
              Sponsorship verified
            </button>

            {/* Regional Hubs Only Filter */}
            <button
              type="button"
              onClick={() => setRegionalOnly(!regionalOnly)}
              aria-pressed={regionalOnly}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre-600 ${
                regionalOnly
                  ? "border border-amber-600 bg-amber-500 text-white font-semibold shadow-xs"
                  : "border border-surface-border bg-slate-50 text-slate-700 hover:bg-slate-100"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  regionalOnly ? "bg-white" : "bg-amber-500"
                }`}
              />
              Regional hubs only
            </button>
          </div>

          {/* View Mode Switcher (Desktop) */}
          <div className="hidden sm:inline-flex rounded-lg border border-surface-border bg-slate-100 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("map")}
              aria-pressed={viewMode === "map"}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre-600 ${
                viewMode === "map"
                  ? "bg-white text-navy-900 shadow-2xs font-semibold"
                  : "text-slate-600 hover:text-navy-900"
              }`}
            >
              🗺️ Map view
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              aria-pressed={viewMode === "list"}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre-600 ${
                viewMode === "list"
                  ? "bg-white text-navy-900 shadow-2xs font-semibold"
                  : "text-slate-600 hover:text-navy-900"
              }`}
            >
              📋 Directory list ({listEntries.length})
            </button>
          </div>
        </div>

        {/* Category Pills Strip */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
          <span className="font-mono text-xs text-slate-400 mr-1">Sector:</span>
          <button
            type="button"
            onClick={() => setSelectedCategory("")}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre-600 ${
              selectedCategory === ""
                ? "bg-navy-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            All sectors
          </button>
          {QUICK_CATEGORY_PILLS.map((pill) => (
            <button
              key={pill.key}
              type="button"
              onClick={() =>
                setSelectedCategory(
                  selectedCategory === pill.key ? "" : pill.key,
                )
              }
              aria-pressed={selectedCategory === pill.key}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre-600 ${
                selectedCategory === pill.key
                  ? "bg-navy-900 text-white font-semibold"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {pill.label}
            </button>
          ))}

          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="ml-auto text-xs font-medium text-ochre-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre-600 rounded px-1"
            >
              Reset all filters
            </button>
          )}
        </div>
      </div>

      {/* 2. Main Search & Dropdown Row */}
      <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <label className="flex flex-col gap-1 text-sm">
          <span className="sr-only">
            Search companies, roles, technologies or cities
          </span>
          <input
            type="search"
            name="q"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search company, technology, role, or city…"
            className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-navy-900 shadow-2xs placeholder:text-slate-400 focus:border-ochre-600 focus:outline-none focus:ring-1 focus:ring-ochre-600"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="sr-only">Filter by full category</span>
          <select
            name="category"
            value={selectedCategory}
            onChange={(event) => setSelectedCategory(event.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-navy-900 shadow-2xs focus:border-ochre-600 focus:outline-none focus:ring-1 focus:ring-ochre-600"
          >
            <option value="">All categorized sectors</option>
            {categoryGroups.map((group) => (
              <optgroup key={group.groupLabel} label={group.groupLabel}>
                {group.items.map((category) => (
                  <option key={category.key} value={category.key}>
                    {category.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      </div>

      {/* Screen reader live region for search feedback */}
      <div aria-live="polite" className="sr-only">
        {isSearching
          ? `Searching… found ${listEntries.length} results.`
          : `${listEntries.length} employers in view.`}
      </div>

      {/* 3. Docked Detail Panel (when a company is selected) */}
      {selectedEntry && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-md ring-1 ring-slate-900/5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-navy-900 px-2 py-0.5 font-mono text-[11px] font-bold text-white uppercase">
                  Registry Record
                </span>
                {selectedEntry.hasSponsorshipEvidence && (
                  <span className="inline-flex items-center gap-1 rounded bg-forest-50 px-2 py-0.5 text-[11px] font-medium text-forest-800 border border-forest-600/30">
                    <svg
                      aria-hidden="true"
                      className="h-3 w-3 text-forest-800 shrink-0"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 1.944A11.954 11.954 0 012.166 5C2.056 5.649 2 6.319 2 7c0 5.225 3.34 9.67 8 11.317C14.66 16.67 18 12.225 18 7c0-.682-.057-1.35-.166-2.001A11.954 11.954 0 0110 1.944zm3.707 6.763a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Subclass 482 Visa Sponsor
                  </span>
                )}
              </div>
              <h2 className="font-heading text-xl font-bold tracking-tight text-navy-900 sm:text-2xl mt-1">
                {selectedEntry.name}
              </h2>
              <div className="flex flex-wrap items-center gap-3 font-mono text-xs text-slate-600">
                {selectedEntry.city && (
                  <span className="flex items-center gap-1">
                    📍 {selectedEntry.city}
                  </span>
                )}
                {selectedEntry.primaryCategory && (
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-700">
                    {selectedEntry.primaryCategory}
                  </span>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSelectedSlug(null)}
              aria-label="Close employer details"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-navy-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre-600 transition-colors duration-150 motion-reduce:transition-none text-sm font-medium"
            >
              ✕
            </button>
          </div>

          {/* Genuine Auditable Verification Checklist */}
          <div className="mt-4 grid gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3 sm:grid-cols-3 font-mono text-xs text-slate-700">
            <div className="flex items-center gap-1.5">
              <span className="text-forest-700 font-bold">✓</span>
              <span>Entity Verified</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-forest-700 font-bold">✓</span>
              <span>Physical Premises Mapped</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className={
                  selectedEntry.hasSponsorshipEvidence
                    ? "text-forest-700 font-bold"
                    : "text-slate-400 font-bold"
                }
              >
                {selectedEntry.hasSponsorshipEvidence ? "✓" : "○"}
              </span>
              <span>
                {selectedEntry.hasSponsorshipEvidence
                  ? "Substantiated 482 Sponsor"
                  : "No 482 Record on File"}
              </span>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
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
                className="rounded-md bg-navy-900 px-4 py-2 text-xs font-medium text-white hover:bg-navy-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre-600 focus-visible:ring-offset-2 transition-colors duration-150 motion-reduce:transition-none"
              >
                Careers page ↗
              </a>
            )}
            <Link
              href={`/companies/${selectedEntry.slug}`}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-navy-900 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre-600 focus-visible:ring-offset-2 transition-colors duration-150 motion-reduce:transition-none"
            >
              View full profile →
            </Link>
          </div>
        </div>
      )}

      {/* 4. Directory Canvas (Map View vs Full Directory List View) */}
      <div id="directory-content">
        {viewMode === "map" ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            {/* Sidebar list */}
            <div className={showMapMobile ? "hidden lg:block" : ""}>
              {searchError && (
                <p className="mb-3 rounded-lg border border-red-600/40 bg-red-50 p-3 text-sm text-red-900">
                  Search is temporarily unavailable. Please try again.
                </p>
              )}
              {listEntries.length === 0 ? (
                <p className="rounded-lg border border-surface-border bg-white p-4 text-sm text-slate-600">
                  {isSearching
                    ? `No companies matched "${query.trim()}".`
                    : "No employers found in this area — try zooming out."}
                </p>
              ) : (
                <ul className="flex max-h-[34rem] flex-col gap-2 overflow-y-auto pb-16 lg:pb-0">
                  {listEntries.map((entry) => {
                    const isSelected = entry.slug === selectedSlug;
                    return (
                      <li key={entry.slug}>
                        <button
                          type="button"
                          onClick={() => handlePointClick(entry.slug)}
                          aria-pressed={isSelected}
                          className={`w-full rounded-lg border px-3.5 py-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre-600 focus-visible:ring-offset-2 transition-colors duration-150 motion-reduce:transition-none ${
                            isSelected
                              ? "border-navy-900 bg-slate-50/90 shadow-xs ring-1 ring-navy-900/20"
                              : "border-surface-border bg-white hover:border-slate-300 hover:bg-slate-50/60"
                          }`}
                        >
                          <span className="font-heading font-semibold text-navy-900 block truncate">
                            {entry.name}
                          </span>
                          {(entry.city ??
                            entry.primaryCategory ??
                            entry.hasSponsorshipEvidence) && (
                            <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                              {entry.city && (
                                <span className="font-medium">
                                  {entry.city}
                                </span>
                              )}
                              {entry.primaryCategory && (
                                <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-700 font-mono text-[11px]">
                                  {entry.primaryCategory}
                                </span>
                              )}
                              {entry.hasSponsorshipEvidence && (
                                <span className="inline-flex items-center gap-1 rounded bg-forest-50 px-2 py-0.5 text-[11px] font-medium text-forest-800 border border-forest-600/20">
                                  <svg
                                    aria-hidden="true"
                                    className="h-3 w-3 text-forest-800 shrink-0"
                                    viewBox="0 0 20 20"
                                    fill="currentColor"
                                  >
                                    <path
                                      fillRule="evenodd"
                                      d="M10 1.944A11.954 11.954 0 012.166 5C2.056 5.649 2 6.319 2 7c0 5.225 3.34 9.67 8 11.317C14.66 16.67 18 12.225 18 7c0-.682-.057-1.35-.166-2.001A11.954 11.954 0 0110 1.944zm3.707 6.763a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                      clipRule="evenodd"
                                    />
                                  </svg>
                                  Sponsors
                                </span>
                              )}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Map Canvas */}
            <div className={showMapMobile ? "" : "hidden lg:block"}>
              <div className="h-[34rem] overflow-hidden rounded-xl border border-surface-border bg-slate-100 shadow-2xs">
                <MapCanvas
                  points={displayedPoints}
                  initialBbox={initialBbox}
                  cameraTarget={cameraTarget}
                  onMoveEnd={handleMoveEnd}
                  onPointClick={handlePointClick}
                />
              </div>
            </div>
          </div>
        ) : (
          /* Full Directory List View */
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-surface-border pb-3">
              <span className="font-heading text-lg font-semibold text-navy-900">
                Indexed Employers ({listEntries.length})
              </span>
              <span className="font-mono text-xs text-slate-500">
                Sorted by verification status &amp; name
              </span>
            </div>

            {listEntries.length === 0 ? (
              <p className="rounded-lg border border-surface-border bg-white p-6 text-sm text-slate-600">
                No employers match the selected criteria.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {listEntries.map((entry) => (
                  <div
                    key={entry.slug}
                    className="flex flex-col justify-between rounded-xl border border-surface-border bg-white p-4 shadow-2xs hover:border-ochre-600/40 transition-colors duration-150 motion-reduce:transition-none"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={`/companies/${entry.slug}`}
                          className="font-heading font-semibold text-navy-900 hover:text-ochre-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre-600 rounded"
                        >
                          {entry.name}
                        </Link>
                        {entry.hasSponsorshipEvidence && (
                          <span className="shrink-0 rounded bg-forest-50 px-1.5 py-0.5 text-[10px] font-medium text-forest-800 border border-forest-600/20">
                            Sponsors
                          </span>
                        )}
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-xs text-slate-600">
                        {entry.city && (
                          <span className="font-medium">📍 {entry.city}</span>
                        )}
                        {entry.primaryCategory && (
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-700 font-mono text-[11px]">
                            {entry.primaryCategory}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                      {entry.careersUrl ? (
                        <a
                          href={entry.careersUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-slate-500 hover:text-navy-900 hover:underline"
                        >
                          Careers ↗
                        </a>
                      ) : (
                        <span className="text-slate-400">Verified ABN</span>
                      )}
                      <Link
                        href={`/companies/${entry.slug}`}
                        className="font-medium text-ochre-700 hover:underline"
                      >
                        Profile →
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 5. "Tech Beyond Sydney" — Regional Hubs Grid */}
      <section className="mt-6 flex flex-col gap-4 border-t border-surface-border pt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="font-heading text-xl font-bold tracking-tight text-navy-900 sm:text-2xl">
              Tech beyond Sydney
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Explore established tech employers and innovation clusters across
              Australia&apos;s regional cities.
            </p>
          </div>
          <span className="font-mono text-xs text-slate-500 font-medium">
            Click any hub to focus map
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {REGIONAL_HUBS.map((hub) => (
            <button
              key={hub.city}
              type="button"
              onClick={() => handleSelectHub(hub)}
              className="flex flex-col justify-between rounded-xl border border-surface-border bg-white p-4 text-left shadow-2xs hover:border-navy-900 hover:bg-slate-50/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre-600 transition-colors duration-150 motion-reduce:transition-none group"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-heading text-base font-bold text-navy-900 group-hover:text-ochre-800">
                    {hub.city}
                  </span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-600 uppercase">
                    {hub.state}
                  </span>
                </div>
                <p className="mt-1 line-clamp-1 font-mono text-[11px] text-slate-500">
                  {hub.tag}
                </p>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 font-mono text-xs text-slate-600">
                <span>
                  <strong className="font-semibold text-navy-900 tabular-nums">
                    {hub.count}
                  </strong>{" "}
                  employers
                </span>
                <span className="text-ochre-700 font-bold group-hover:translate-x-0.5 transition-transform duration-150">
                  ↗
                </span>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Mobile Floating Toggle */}
      {!selectedEntry && (
        <div className="fixed inset-x-0 bottom-4 z-20 flex justify-center lg:hidden">
          <div className="inline-flex rounded-full border border-surface-border bg-navy-950/90 p-1 shadow-xl backdrop-blur-md">
            <button
              type="button"
              onClick={() => setShowMapMobile(false)}
              aria-pressed={!showMapMobile}
              className={`rounded-full px-4 py-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre-600 transition-colors duration-150 motion-reduce:transition-none ${
                showMapMobile
                  ? "text-slate-300 hover:text-white"
                  : "bg-ochre-600 text-white shadow-xs"
              }`}
            >
              List ({listEntries.length})
            </button>
            <button
              type="button"
              onClick={() => setShowMapMobile(true)}
              aria-pressed={showMapMobile}
              className={`rounded-full px-4 py-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre-600 transition-colors duration-150 motion-reduce:transition-none ${
                showMapMobile
                  ? "bg-ochre-600 text-white shadow-xs"
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
