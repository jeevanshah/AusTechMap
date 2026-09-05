"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import type {
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
}

function pointsToListEntries(points: MapCompanyPoint[]): ListEntry[] {
  return points.map((point) => ({
    slug: point.slug,
    name: point.name,
    careersUrl: point.careersUrl,
  }));
}

function searchResultsToListEntries(
  results: CompanySearchResult[],
): ListEntry[] {
  return results.map((result) => ({
    slug: result.slug,
    name: result.name,
    careersUrl: null,
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
  const moveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    const trimmed = query.trim();
    // When the query is blank, render falls back to `points` instead of
    // `searchResults` (see `isSearching` below) -- no fetch, and no need
    // to clear stale results synchronously here.
    if (trimmed === "") return;
    searchTimeoutRef.current = setTimeout(() => {
      trackEvent("search_submitted", { query: trimmed });
      fetch(`/api/search/companies?q=${encodeURIComponent(trimmed)}`)
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
  }, [query]);

  const handleMoveEnd = useCallback((bbox: Bbox, zoom: number) => {
    if (moveTimeoutRef.current) clearTimeout(moveTimeoutRef.current);
    moveTimeoutRef.current = setTimeout(() => {
      const bboxParam = `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`;
      fetch(`/api/map/companies?bbox=${bboxParam}&zoom=${zoom}`)
        .then((response) => response.json())
        .then((body: { points?: MapCompanyPoint[] }) =>
          setPoints(body.points ?? []),
        )
        .catch(() => {
          /* keep showing the last-known points rather than clearing the map */
        });
    }, MOVE_DEBOUNCE_MS);
  }, []);

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
      <p className="text-xs text-emerald-950/50">
        Category, hiring, sponsorship, and regional filters land in later
        phases.
      </p>

      <div className="flex justify-end lg:hidden">
        <button
          type="button"
          onClick={() => setShowMapMobile((value) => !value)}
          className="rounded-full border border-emerald-950/40 px-4 py-2 text-sm font-medium"
        >
          {showMapMobile ? "Show list" : "Show map"}
        </button>
      </div>

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
            <ul className="flex max-h-[32rem] flex-col gap-2 overflow-y-auto">
              {listEntries.map((entry) => (
                <li key={entry.slug}>
                  <button
                    type="button"
                    onClick={() => handlePointClick(entry.slug)}
                    className="w-full rounded-xl border border-emerald-950/15 px-4 py-3 text-left text-sm hover:border-emerald-900/40"
                  >
                    {entry.name}
                  </button>
                </li>
              ))}
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

      {selectedEntry && (
        <div className="rounded-xl border border-emerald-950/20 bg-white p-4 text-sm shadow-sm">
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
    </div>
  );
}
