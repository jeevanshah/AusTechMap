-- Adds a location_match_method value for points resolved via a third-party
-- geocoding API (Mapbox), used as a stand-in while Phase 2's own G-NAF
-- exact-match pipeline has no real G-NAF data loaded yet. Distinct from
-- 'manual_override' (no human hand-typed the coordinate) so
-- resolved_locations.method stays an honest record of how a point was
-- actually obtained.
ALTER TYPE location_match_method ADD VALUE 'external_geocoder';
