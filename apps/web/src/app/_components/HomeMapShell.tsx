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
      <label className="flex flex-col gap-1 text-sm">
        <span className="sr-only">Search companies, roles or technologies</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search companies, roles or technologies"
          className="rounded-full border border-emerald-950/20 px-4 py-3 text-base"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="sr-only">Filter by category</span>
        <select
          value={selectedCategory}
          onChange={(event) => setSelectedCategory(event.target.value)}
          className="rounded-full border border-emerald-950/20 px-4 py-2 text-sm"
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
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={sponsorshipOnly}
          onChange={(event) => setSponsorshipOnly(event.target.checked)}
          className="h-4 w-4 rounded border-emerald-950/30"
        />
        Has sponsorship evidence
      </label>
      <p className="text-xs text-emerald-950/50">
        Hiring and regional filters land in later phases.
      </p>

      {selectedEntry && (
        <div className="fixed inset-x-0 bottom-0 z-30 max-h-[70vh] overflow-y-auto rounded-t-2xl border border-emerald-950/20 bg-white p-4 text-sm shadow-lg lg:static lg:z-auto lg:mb-1 lg:max-h-none lg:overflow-visible lg:rounded-xl lg:shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <span className="font-medium">{selectedEntry.name}</span>
            <button
              type="button"
              onClick={() => setSelectedSlug(null)}
              aria-label="Close"
              className="text-emerald-950/50"
            >
              ✕
            </button>
          </div>
          <div className="mt-3 flex gap-4">
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
                className="rounded-full bg-emerald-900 px-4 py-2 text-xs font-medium text-white"
              >
                Careers page
              </a>
            )}
            <Link
              href={`/companies/${selectedEntry.slug}`}
              className="rounded-full border border-emerald-950/40 px-4 py-2 text-xs font-medium"
            >
              View full profile →
            </Link>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className={showMapMobile ? "hidden lg:block" : ""}>
          {searchError && (
            <p className="mb-3 rounded-xl border border-red-600/40 bg-red-50 p-3 text-sm text-red-900">
              Search is temporarily unavailable. Please try again.
            </p>
          )}
          {listEntries.length === 0 ? (
            <p className="rounded-xl border border-emerald-950/15 p-4 text-sm text-emerald-950/60">
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
                      className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition ${
                        isSelected
                          ? "border-emerald-900 bg-emerald-50"
                          : "border-emerald-950/15 hover:border-emerald-900/40"
                      }`}
                    >
                      <span className="font-medium">{entry.name}</span>
                      {(entry.city ??
                        entry.primaryCategory ??
                        entry.hasSponsorshipEvidence) && (
                        <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-stone-600">
                          {entry.city && <span>{entry.city}</span>}
                          {entry.primaryCategory && (
                            <span className="rounded-full bg-emerald-950/5 px-2 py-0.5">
                              {entry.primaryCategory}
                            </span>
                          )}
                          {entry.hasSponsorshipEvidence && (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-800">
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
          <div className="h-[32rem] overflow-hidden rounded-2xl border border-emerald-950/15">
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
          <div className="inline-flex rounded-full border border-emerald-950/20 bg-white p-1 shadow-lg">
            <button
              type="button"
              onClick={() => setShowMapMobile(false)}
              aria-pressed={!showMapMobile}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                showMapMobile
                  ? "text-emerald-950/70"
                  : "bg-emerald-900 text-white"
              }`}
            >
              List ({listEntries.length})
            </button>
            <button
              type="button"
              onClick={() => setShowMapMobile(true)}
              aria-pressed={showMapMobile}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                showMapMobile
                  ? "bg-emerald-900 text-white"
                  : "text-emerald-950/70"
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
