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

export interface MapCanvasProps {
  points: MapCompanyPoint[];
  initialBbox: Bbox;
  interactive?: boolean;
  onMoveEnd?: (bbox: Bbox, zoom: number) => void;
  onPointClick?: (slug: string) => void;
}

function pointsToGeoJson(points: MapCompanyPoint[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: points.map((point) => ({
      type: "Feature",
      properties: { slug: point.slug, name: point.name },
      geometry: { type: "Point", coordinates: [point.lng, point.lat] },
    })),
  };
}

const SOURCE_ID = "companies";

export function MapCanvas({
  points,
  initialBbox,
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
          "circle-color": "#d97706",
          "circle-stroke-color": "#b45309",
          "circle-stroke-width": 2,
          "circle-radius": ["step", ["get", "point_count"], 16, 10, 22, 50, 28],
          "circle-opacity": 0.92,
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
        id: "unclustered-point",
        type: "circle",
        source: SOURCE_ID,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": "#0f172a",
          "circle-radius": 7,
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

      map.on("click", "unclustered-point", (event: MapLayerMouseEvent) => {
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
      });
      map.on("mouseenter", "unclustered-point", setPointerCursor);
      map.on("mouseleave", "unclustered-point", resetCursor);

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

  return <div ref={containerRef} className="h-full w-full" />;
}
