"use client";

import {
  Map as MapLibreMap,
  NavigationControl,
  config,
  type GeoJSONSource,
  type MapLayerMouseEvent,
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
  timestamp?: number;
}

export interface MapCanvasProps {
  points: MapCompanyPoint[];
  initialBbox: Bbox;
  cameraTarget?: CameraTarget | null;
  interactive?: boolean;
  onMoveEnd?: (bbox: Bbox, zoom: number) => void;
  onPointClick?: (slug: string) => void;
}

function pointsToGeoJson(points: MapCompanyPoint[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: points.map((point) => ({
      type: "Feature",
      properties: {
        slug: point.slug,
        name: point.name,
        hasSponsorshipEvidence: point.hasSponsorshipEvidence ? 1 : 0,
        isRegional: point.isRegional ? 1 : 0,
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
            "#60a5fa", // 1-4: Regional hubs (Darwin, Hobart) - Sky Azure
            5,
            "#f59e0b", // 5-9: Emerging hubs (Adelaide, Canberra) - Warm Amber
            10,
            "#3b82f6", // 10-19: Established hubs (Brisbane, Perth) - Pacific Azure
            20,
            "#2563eb", // 20-39: Major tech hub (Melbourne) - Royal Cobalt
            40,
            "#c2410c", // 40+: Flagship Innovation Center (Sydney) - Terracotta Red Earth
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
            ["==", ["get", "hasSponsorshipEvidence"], 1],
            "#15803d",
            ["==", ["get", "isRegional"], 1],
            "#b45309",
            "#2563eb",
          ],
          "circle-radius": 12,
          "circle-opacity": 0.18,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": [
            "case",
            ["==", ["get", "hasSponsorshipEvidence"], 1],
            "#15803d",
            ["==", ["get", "isRegional"], 1],
            "#b45309",
            "#2563eb",
          ],
          "circle-stroke-opacity": 0.45,
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
            ["==", ["get", "hasSponsorshipEvidence"], 1],
            "#15803d",
            ["==", ["get", "isRegional"], 1],
            "#b45309",
            "#2563eb",
          ],
          "circle-radius": 6.5,
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
          map.easeTo({
            center: (feature.geometry as GeoJSON.Point).coordinates as [
              number,
              number,
            ],
            duration: 300,
          });
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

    if (onMoveEndRef.current) {
      map.on("moveend", () => {
        const bounds = map.getBounds();
        onMoveEndRef.current?.(
          {
            west: bounds.getWest(),
            south: bounds.getSouth(),
            east: bounds.getEast(),
            north: bounds.getNorth(),
          },
          map.getZoom(),
        );
      });
    }

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
    source?.setData(pointsToGeoJson(points));
  }, [points]);

  useEffect(() => {
    if (!cameraTarget) return;
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({
      center: cameraTarget.center,
      zoom: cameraTarget.zoom ?? 11,
      essential: true,
      duration: 1200,
    });
  }, [cameraTarget]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
