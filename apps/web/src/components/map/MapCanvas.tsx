"use client";

import {
  Map as MapLibreMap,
  type GeoJSONSource,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";

import type { MapCompanyPoint } from "@austechmap/contracts";
import type { FeatureCollection } from "geojson";

// ARCHITECTURE_DECISIONS.md §3.5: MapLibre GL JS + OpenFreeMap's free hosted
// vector tiles. Positron's muted basemap is used deliberately so it doesn't
// visually compete with this app's emerald-palette pins.
const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

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
          "circle-color": "#065f46",
          "circle-radius": ["step", ["get", "point_count"], 16, 10, 22, 50, 28],
          "circle-opacity": 0.85,
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
          "circle-color": "#136f50",
          "circle-radius": 7,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });

      map.on("click", "unclustered-point", (event: MapLayerMouseEvent) => {
        const slug = event.features?.[0]?.properties?.slug as
          string | undefined;
        if (slug) onPointClickRef.current?.(slug);
      });
      map.on("mouseenter", "unclustered-point", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "unclustered-point", () => {
        map.getCanvas().style.cursor = "";
      });
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
