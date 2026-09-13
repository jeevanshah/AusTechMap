"use client";

import {
  Map as MapLibreMap,
  NavigationControl,
  config,
  type GeoJSONSource,
  type MapLayerMouseEvent,
  type PaddingOptions,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";

import type { MapCompanyPoint } from "@austechmap/contracts";
import type { FeatureCollection } from "geojson";

// ARCHITECTURE_DECISIONS.md §3.5: MapLibre GL JS + OpenFreeMap's free hosted
// vector tiles. Positron's muted basemap is used deliberately so it doesn't
// visually compete with this app's navy/ochre pins.
const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

// MapLibre's default worker-URL resolution derives from `import.meta.url`,
// which Next.js/Turbopack compiles to a file:// path rather than an
// http(s):// one. That makes MapLibre construct `new Worker("")`, which
// crashes immediately -- the worker thread never starts, so `map.on("load")`
// never fires, no tiles are ever requested, and the canvas stays blank
// (diagnosed via live browser DevTools). Point it at self-hosted copies of
// maplibre-gl's worker chunk instead. These two files are a verbatim copy of
// node_modules/maplibre-gl/dist/{maplibre-gl-worker,maplibre-gl-shared}.mjs
// (the worker imports the shared chunk by relative path, so both must be
// re-copied together on every maplibre-gl version bump).
if (typeof window !== "undefined") {
  config.WORKER_URL = "/maplibre-gl-worker.mjs";
}

export interface Bbox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface CameraTarget {
  center: [number, number]; // [lng, lat]
  zoom?: number;
  offset?: [number, number];
  padding?: PaddingOptions;
  timestamp?: number;
}

export interface MapCanvasProps {
  points: MapCompanyPoint[];
  initialBbox: Bbox;
  cameraTarget?: CameraTarget | null;
  selectedSlug?: string | null;
  interactive?: boolean;
  onMoveEnd?: (bbox: Bbox, zoom: number) => void;
  onPointClick?: (slug: string) => void;
}

function pointsToGeoJson(
  points: MapCompanyPoint[],
  selectedSlug?: string | null,
): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: points.map((point) => ({
      type: "Feature",
      properties: {
        slug: point.slug,
        name: point.name,
        hasSponsorshipEvidence: point.hasSponsorshipEvidence ? 1 : 0,
        isRegional: point.isRegional ? 1 : 0,
        activeJobsCount: point.activeJobsCount ?? 0,
        isHiring: (point.activeJobsCount ?? 0) > 0 ? 1 : 0,
        isSelected: selectedSlug && point.slug === selectedSlug ? 1 : 0,
      },
      geometry: { type: "Point", coordinates: [point.lng, point.lat] },
    })),
  };
}

const SOURCE_ID = "companies";

export function MapCanvas({
  points,
  initialBbox,
  cameraTarget,
  selectedSlug,
  interactive = true,
  onMoveEnd,
  onPointClick,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const onMoveEndRef = useRef(onMoveEnd);
  const onPointClickRef = useRef(onPointClick);
  const pointsRef = useRef(points);

  useEffect(() => {
    onMoveEndRef.current = onMoveEnd;
    onPointClickRef.current = onPointClick;
  }, [onMoveEnd, onPointClick]);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: STYLE_URL,
      bounds: [
        [initialBbox.west, initialBbox.south],
        [initialBbox.east, initialBbox.north],
      ],
      interactive,
    });
    mapRef.current = map;

    map.on("load", () => {
      // Seeded from the ref, not the empty array, so the very first paint
      // already has the caller's initial points -- the source doesn't
      // exist yet when the points-watching effect below first runs (its
      // timing isn't causally linked to this async "load" event), so
      // relying on that effect alone to backfill data would leave the map
      // empty until the next pan/zoom refetch.
      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: pointsToGeoJson(pointsRef.current),
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50,
      });

      map.addLayer({
        id: "clusters",
        type: "circle",
        source: SOURCE_ID,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": [
            "step",
            ["get", "point_count"],
            "#475569", // 1-4: Regional hubs (Darwin, Hobart) - Slate 600
            5,
            "#334155", // 5-9: Emerging hubs (Adelaide, Canberra) - Slate 700
            10,
            "#1e293b", // 10-19: Established hubs (Brisbane, Perth) - Slate 800
            20,
            "#0f172a", // 20-39: Major tech hub (Melbourne) - Midnight Navy
            40,
            "#c2410c", // 40+: Flagship Innovation Center (Sydney) - Australian Terracotta
          ],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
          "circle-radius": [
            "step",
            ["get", "point_count"],
            16,
            5,
            20,
            10,
            24,
            20,
            28,
            40,
            32,
          ],
          "circle-opacity": 0.95,
        },
      });
      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: SOURCE_ID,
        filter: ["has", "point_count"],
        layout: { "text-field": "{point_count_abbreviated}", "text-size": 12 },
        paint: { "text-color": "#ffffff" },
      });
      map.addLayer({
        id: "unclustered-point-halo",
        type: "circle",
        source: SOURCE_ID,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": [
            "case",
            ["==", ["get", "isHiring"], 1],
            "#059669",
            ["==", ["get", "hasSponsorshipEvidence"], 1],
            "#c2410c",
            "#0f172a",
          ],
          "circle-radius": ["case", ["==", ["get", "isHiring"], 1], 13, 11],
          "circle-opacity": 0.15,
          "circle-stroke-width": 1,
          "circle-stroke-color": [
            "case",
            ["==", ["get", "isHiring"], 1],
            "#059669",
            ["==", ["get", "hasSponsorshipEvidence"], 1],
            "#c2410c",
            "#0f172a",
          ],
          "circle-stroke-opacity": 0.35,
        },
      });
      map.addLayer({
        id: "unclustered-point-selected-ring",
        type: "circle",
        source: SOURCE_ID,
        filter: [
          "all",
          ["!", ["has", "point_count"]],
          ["==", ["get", "isSelected"], 1],
        ],
        paint: {
          "circle-color": "#c2410c",
          "circle-radius": 15,
          "circle-opacity": 0.25,
          "circle-stroke-width": 2.5,
          "circle-stroke-color": "#c2410c",
          "circle-stroke-opacity": 0.9,
        },
      });

      map.addLayer({
        id: "unclustered-point",
        type: "circle",
        source: SOURCE_ID,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": [
            "case",
            ["==", ["get", "isHiring"], 1],
            "#059669",
            ["==", ["get", "hasSponsorshipEvidence"], 1],
            "#c2410c",
            "#0f172a",
          ],
          "circle-radius": ["case", ["==", ["get", "isHiring"], 1], 7, 6.5],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });

      const handleClusterClick = async (event: MapLayerMouseEvent) => {
        const features = map.queryRenderedFeatures(event.point, {
          layers: ["clusters"],
        });
        const cluster = features[0];
        if (!cluster || !cluster.properties) return;
        const clusterId = cluster.properties.cluster_id as number | undefined;
        if (clusterId === undefined) return;

        const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
        if (!source) return;

        const geometry = cluster.geometry as GeoJSON.Point;
        const currentZoom = map.getZoom();
        try {
          const expansionZoom = await source.getClusterExpansionZoom(clusterId);
          // Smart zoom: zoom to the expansion level, or if points have identical
          // coordinates, step in by +2 up to max zoom 16 so the click always advances.
          const targetZoom =
            expansionZoom !== undefined &&
            expansionZoom !== null &&
            expansionZoom > currentZoom
              ? expansionZoom
              : Math.min(currentZoom + 2, 16);

          map.easeTo({
            center: geometry.coordinates as [number, number],
            zoom: targetZoom,
            duration: 400,
          });
        } catch {
          map.easeTo({
            center: geometry.coordinates as [number, number],
            zoom: Math.min(currentZoom + 2, 16),
            duration: 400,
          });
        }
      };

      map.on("click", "clusters", handleClusterClick);
      map.on("click", "cluster-count", handleClusterClick);

      const setPointerCursor = () => {
        map.getCanvas().style.cursor = "pointer";
      };
      const resetCursor = () => {
        map.getCanvas().style.cursor = "";
      };

      map.on("mouseenter", "clusters", setPointerCursor);
      map.on("mouseleave", "clusters", resetCursor);
      map.on("mouseenter", "cluster-count", setPointerCursor);
      map.on("mouseleave", "cluster-count", resetCursor);

      const handlePointClick = (event: MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        const slug = feature?.properties?.slug as string | undefined;
        if (slug) onPointClickRef.current?.(slug);
        if (feature?.geometry.type === "Point") {
          const isDesktop =
            typeof window !== "undefined" && window.innerWidth >= 640;
          const easeOptions: Parameters<typeof map.easeTo>[0] = {
            center: (feature.geometry as GeoJSON.Point).coordinates as [
              number,
              number,
            ],
            duration: 350,
          };
          if (isDesktop) {
            easeOptions.padding = { left: 320, top: 0, right: 0, bottom: 0 };
          }
          map.easeTo(easeOptions);
        }
      };

      map.on("click", "unclustered-point", handlePointClick);
      map.on("click", "unclustered-point-halo", handlePointClick);
      map.on("mouseenter", "unclustered-point", setPointerCursor);
      map.on("mouseleave", "unclustered-point", resetCursor);
      map.on("mouseenter", "unclustered-point-halo", setPointerCursor);
      map.on("mouseleave", "unclustered-point-halo", resetCursor);

      if (interactive) {
        map.addControl(
          new NavigationControl({ showCompass: false }),
          "top-right",
        );
      }
    });

    map.on("moveend", () => {
      const bounds = map.getBounds();
      const zoom = map.getZoom();
      let west = bounds.getWest();
      let east = bounds.getEast();
      let south = bounds.getSouth();
      let north = bounds.getNorth();

      // When zoomed out to continental / national scale (zoom <= 5) or spanning the globe,
      // use canonical Australia bounds so all nationwide companies are loaded without clipping
      if (zoom <= 5 || east - west >= 300) {
        west = 96;
        east = 168;
        south = -45;
        north = -9;
      } else {
        west = Math.max(-180, Math.min(180, west));
        east = Math.max(-180, Math.min(180, east));
        south = Math.max(-89.9, Math.min(89.9, south));
        north = Math.max(-89.9, Math.min(89.9, north));
        if (west >= east) {
          west = -180;
          east = 180;
        }
        if (south >= north) {
          south = -89.9;
          north = 89.9;
        }
      }
      onMoveEndRef.current?.(
        { west, south, east, north },
        zoom,
      );
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // initialBbox/interactive are intentionally only used on first mount --
    // this effect constructs the map exactly once per component instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    pointsRef.current = points;
    const map = mapRef.current;
    if (!map) return;
    const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(pointsToGeoJson(points, selectedSlug));
  }, [points, selectedSlug]);

  useEffect(() => {
    if (!cameraTarget) return;
    const map = mapRef.current;
    if (!map) return;
    const flyOptions: Parameters<typeof map.flyTo>[0] = {
      center: cameraTarget.center,
      zoom: cameraTarget.zoom ?? 11,
      essential: true,
      duration: 1200,
    };
    if (cameraTarget.offset) {
      flyOptions.offset = cameraTarget.offset;
    }
    if (cameraTarget.padding) {
      flyOptions.padding = cameraTarget.padding;
    }
    map.flyTo(flyOptions);
  }, [cameraTarget]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
