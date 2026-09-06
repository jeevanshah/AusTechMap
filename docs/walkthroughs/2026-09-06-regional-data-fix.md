# Walkthrough: Dynamic Regional Data & Heuristic Fixes

> **Date:** 6 September 2026  
> **Commit:** `08b2fec` (`fix(regions): wire real Home Affairs designated regional data and isRegional field`)

We replaced the static hardcoded hubs and naive city string exclusions (`city !== 'Sydney' && city !== 'Melbourne'`) with the real database-backed `/api/regions` pipeline and `isRegional` field derived from `resolved_locations.migration_category IS NOT NULL`.

---

## 1. Context & Motivation

Under the Australian Department of Home Affairs migration regulations (e.g., Subclass 482 / 491 / 494 visas), regional Australia is strictly defined by specific postcodes and statistical areas (`migration_category IS NOT NULL`). 

Previously, two flawed heuristics were in place:
1. **SQL query in `page.tsx`**: Naively excluded `city NOT IN ('Sydney', 'Melbourne')`, which erroneously treated metropolitan cities like Brisbane as regional.
2. **Client-side filter in `HomeMapShell.tsx`**: Filtered displayed cards and pins with `city !== 'Sydney' && city !== 'Melbourne'`.
3. **Hardcoded Hubs List**: Used a static `REGIONAL_HUBS` array with hardcoded company counts.

---

## 2. Changes Made

### A. Database Query (`apps/web/src/app/page.tsx`)
- Updated SQL query to compute real designated regional employers based on `migration_category IS NOT NULL`:
  ```sql
  count(DISTINCT CASE WHEN EXISTS (
    SELECT 1 FROM company_locations cl2
    JOIN resolved_locations rl2 ON rl2.id = cl2.resolved_location_id
    WHERE cl2.company_id = c.id AND rl2.migration_category IS NOT NULL
  ) THEN c.id END) as regional_employers
  ```
- Added `listRegionalHubs(pool)` to `loadHomeData()` to load real regional hubs server-side and pass `initialHubs={hubs}` into `<HomeMapShell />`.

### B. Client & Map Shell (`apps/web/src/app/_components/HomeMapShell.tsx`)
- **Props & Types**:
  - Imported `type RegionalHub` from `@austechmap/contracts`.
  - Added `initialHubs?: RegionalHub[]` to `HomeMapShellProps`.
  - Added `isRegional: boolean` to `ListEntry`.
  - Mapped `isRegional: point.isRegional` in `pointsToListEntries`.
  - Mapped `isRegional: result.isRegional` in `searchResultsToListEntries`.
- **Dynamic Hubs**:
  - Replaced `REGIONAL_HUBS` constant with `HUB_METADATA` (curated geographic metadata: coordinates, state, icon, editorial tagline).
  - Added dynamic state `const [hubs, setHubs] = useState<RegionalHub[]>(initialHubs ?? []);` with `/api/regions` fetch fallback.
  - Computed `displayedHubs` memo combining real counts from PostgreSQL with geographic metadata.
- **API Param Filtering**:
  - Search query appends `&regional=true` when `regionalOnly` is active; re-triggers on filter toggle.
  - Map query appends `&regional=true` when `regionalOnly` is active; re-triggers on filter toggle.
- **Client-Side Filtering**:
  - Replaced `city !== "Sydney" && city !== "Melbourne"` in `listEntries` and `displayedPoints` with `entry.isRegional` and `point.isRegional`.
- **UI Components**:
  - Region dropdown selector dynamically populates with the 11 designated regional hubs from `/api/regions`.
  - Directory tab shows dynamic hub count (`11 hubs`).
  - Bottom-left floating spotlight card highlights the #1 designated regional hub dynamically (Perth, 10 verified employers).

---

## 3. Verification

### Automated Tests
- `npm test` in `apps/web`: 6 test files passed, 39 tests passed.
- `npm run lint` in `apps/web`: 0 errors / 0 warnings.
- `npx tsc --noEmit` in `apps/web`: 0 type errors.

### Live Endpoints
- `GET /api/regions`: Returns 11 designated regional hubs (Perth 10, Adelaide 9, Canberra 8, Wollongong 6, Newcastle 5, Darwin 3, Geelong 2, Gold Coast 2, Hobart 2, Sunshine Coast 2, Bendigo 1).
- `GET /api/search/companies?q=canberra&regional=true`: Returns Canberra Data Centres with `isRegional: true`.
- `GET /api/search/companies?q=sydney&regional=true`: Returns `[]` (Sydney excluded).
- `GET /api/search/companies?q=brisbane&regional=true`: Returns `[]` (Brisbane properly excluded as metropolitan under migration law).
- `GET /api/map/companies?bbox=110,-45,155,-10&regional=true`: Returns 32 regional employer points with `isRegional: true`.

---

## 4. Future Refinements (Track 6B / Phase 3)
- **Dynamic Sector Taglines**: Currently, the per-city taglines (e.g. "Lot Fourteen Space, Defence & Machine Learning" for Adelaide) in `HUB_METADATA` are curated editorial descriptions. These can eventually be dynamically derived from the top category frequencies per region in PostgreSQL.
