"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  Category,
  CompanySearchResult,
  MapCompanyPoint,
} from "@austechmap/contracts";

import { MapCanvas, type Bbox } from "../../components/map/MapCanvas";
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
    // When the query is blank, render falls back to `points` instead of
    // `searchResults` (see `isSearching` below) -- no fetch, and no need
    // to clear stale results synchronously here.
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
    // Skipped on mount: `initialPoints` already reflects currentBbox with
    // no category filter, so re-fetching the same thing on first render
    // would be redundant. Fires on every later bbox move or category
    // change instead.
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
  const listEntries = isSearching
    ? searchResultsToListEntries(searchResults ?? [])
    : pointsToListEntries(points);
  const selectedEntry =
    listEntries.find((entry) => entry.slug === selectedSlug) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="sr-only">
            Search companies, roles or technologies
          </span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search companies, roles or technologies"
            className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-navy-900 shadow-2xs placeholder:text-slate-400 focus:border-ochre-600 focus:outline-none focus:ring-1 focus:ring-ochre-600"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="sr-only">Filter by category</span>
          <select
            value={selectedCategory}
            onChange={(event) => setSelectedCategory(event.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-navy-900 shadow-2xs focus:border-ochre-600 focus:outline-none focus:ring-1 focus:ring-ochre-600"
          >
            <option value="">All categories</option>
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

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-navy-900 font-medium">
          <input
            type="checkbox"
            checked={sponsorshipOnly}
            onChange={(event) => setSponsorshipOnly(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-ochre-600 focus:ring-ochre-600"
          />
          Has sponsorship evidence
        </label>
      </div>
      <p className="-mt-2 text-xs text-slate-500">
        Hiring and regional filters land in later phases.
      </p>

      {selectedEntry && (
        <div className="fixed inset-x-0 bottom-0 z-30 max-h-[70vh] overflow-y-auto rounded-t-xl border border-surface-border bg-white p-4 text-sm shadow-xl lg:static lg:z-auto lg:mb-1 lg:max-h-none lg:overflow-visible lg:rounded-lg lg:shadow-xs">
          <div className="flex items-center justify-between gap-4">
            <span className="font-heading font-semibold text-navy-900 text-base">
              {selectedEntry.name}
            </span>
            <button
              type="button"
              onClick={() => setSelectedSlug(null)}
              aria-label="Close"
              className="text-slate-400 hover:text-navy-900 text-sm font-medium"
            >
              ✕
            </button>
          </div>
          <div className="mt-3 flex gap-3">
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
                className="rounded-md bg-navy-900 px-4 py-2 text-xs font-medium text-white hover:bg-navy-800 transition"
              >
                Careers page ↗
              </a>
            )}
            <Link
              href={`/companies/${selectedEntry.slug}`}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-navy-900 hover:bg-slate-50 transition"
            >
              View full profile →
            </Link>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
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
            <ul className="flex max-h-[32rem] flex-col gap-2 overflow-y-auto pb-16 lg:pb-0">
              {listEntries.map((entry) => {
                const isSelected = entry.slug === selectedSlug;
                return (
                  <li key={entry.slug}>
                    <button
                      type="button"
                      onClick={() => handlePointClick(entry.slug)}
                      aria-pressed={isSelected}
                      className={`w-full rounded-lg border px-3.5 py-3 text-left text-sm transition ${
                        isSelected
                          ? "border-ochre-600 bg-ochre-50/60 shadow-xs ring-1 ring-ochre-600"
                          : "border-surface-border bg-white hover:border-slate-300 hover:bg-slate-50/50"
                      }`}
                    >
                      <span className="font-heading font-semibold text-navy-900 block">
                        {entry.name}
                      </span>
                      {(entry.city ??
                        entry.primaryCategory ??
                        entry.hasSponsorshipEvidence) && (
                        <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                          {entry.city && (
                            <span className="font-medium">{entry.city}</span>
                          )}
                          {entry.primaryCategory && (
                            <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-700 font-mono text-[11px]">
                              {entry.primaryCategory}
                            </span>
                          )}
                          {entry.hasSponsorshipEvidence && (
                            <span className="inline-flex items-center gap-1 rounded bg-forest-50 px-2 py-0.5 text-[11px] font-medium text-forest-800 border border-forest-600/20">
                              <svg
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

        <div className={showMapMobile ? "" : "hidden lg:block"}>
          <div className="h-[32rem] overflow-hidden rounded-xl border border-surface-border bg-slate-100 shadow-2xs">
            <MapCanvas
              points={points}
              initialBbox={initialBbox}
              onMoveEnd={handleMoveEnd}
              onPointClick={handlePointClick}
            />
          </div>
        </div>
      </div>

      {!selectedEntry && (
        <div className="fixed inset-x-0 bottom-4 z-20 flex justify-center lg:hidden">
          <div className="inline-flex rounded-full border border-surface-border bg-navy-950/90 p-1 shadow-xl backdrop-blur-md">
            <button
              type="button"
              onClick={() => setShowMapMobile(false)}
              aria-pressed={!showMapMobile}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
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
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
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
