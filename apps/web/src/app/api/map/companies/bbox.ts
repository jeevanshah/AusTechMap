import type { Bbox } from "../../../../lib/queries/mapCompanies";

export interface ParsedBboxParams {
  bbox: Bbox;
  zoom: number;
  category: string | null;
}

export type BboxParseResult =
  { ok: true; params: ParsedBboxParams } | { ok: false; error: string };

const DEFAULT_ZOOM = 4;
const MIN_ZOOM = 0;
const MAX_ZOOM = 22;

/**
 * Snaps a bbox outward to a fixed grid so repeated pans over the same area
 * produce the same query string -- this is what makes the route's
 * Cache-Control header actually hit, since an unsnapped bbox is unique to
 * within float precision on almost every pan/zoom event.
 */
function snapBbox(bbox: Bbox, zoom: number): Bbox {
  const cellSize = zoom <= 6 ? 0.5 : 0.05;
  return {
    west: Math.floor(bbox.west / cellSize) * cellSize,
    south: Math.floor(bbox.south / cellSize) * cellSize,
    east: Math.ceil(bbox.east / cellSize) * cellSize,
    north: Math.ceil(bbox.north / cellSize) * cellSize,
  };
}

export function parseBboxParams(
  searchParams: URLSearchParams,
): BboxParseResult {
  const bboxRaw = searchParams.get("bbox");
  if (!bboxRaw) {
    return { ok: false, error: "bbox is required" };
  }
  const parts = bboxRaw.split(",").map(Number);
  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) {
    return {
      ok: false,
      error:
        "bbox must be 4 comma-separated finite numbers: west,south,east,north",
    };
  }
  const [west, south, east, north] = parts as [number, number, number, number];
  if (west >= east || south >= north) {
    return {
      ok: false,
      error: "bbox must satisfy west < east and south < north",
    };
  }
  if (west < -180 || east > 180 || south < -90 || north > 90) {
    return {
      ok: false,
      error: "bbox must be within valid longitude/latitude ranges",
    };
  }

  let zoom = DEFAULT_ZOOM;
  const zoomRaw = searchParams.get("zoom");
  if (zoomRaw !== null) {
    const parsedZoom = Number(zoomRaw);
    if (
      !Number.isFinite(parsedZoom) ||
      !Number.isInteger(parsedZoom) ||
      parsedZoom < MIN_ZOOM ||
      parsedZoom > MAX_ZOOM
    ) {
      return {
        ok: false,
        error: `zoom must be an integer between ${MIN_ZOOM} and ${MAX_ZOOM}`,
      };
    }
    zoom = parsedZoom;
  }

  const categoryRaw = searchParams.get("category")?.trim();
  const category = categoryRaw && categoryRaw !== "" ? categoryRaw : null;

  return {
    ok: true,
    params: {
      bbox: snapBbox({ west, south, east, north }, zoom),
      zoom,
      category,
    },
  };
}
