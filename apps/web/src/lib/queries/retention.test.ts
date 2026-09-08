import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import {
  createSavedSearch,
  deleteSavedSearch,
  listSavedSearches,
} from "./savedSearches";
import {
  toggleCompanyWatch,
  toggleRegionWatch,
} from "./watchlists";
import {
  listUserAlerts,
  markAlertRead,
} from "./userAlerts";

describe("savedSearches queries", () => {
  it("listSavedSearches maps database rows to contract models", async () => {
    const mockRow = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      user_id: "42",
      name: "Adelaide Space & AI",
      filters: { hubCity: "Adelaide", category: "space" },
      alert_frequency: "weekly",
      last_alerted_at: null,
      created_at: new Date("2026-09-08T10:00:00Z"),
      updated_at: new Date("2026-09-08T10:00:00Z"),
    };
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [mockRow] }),
    } as unknown as Pool;

    const searches = await listSavedSearches(pool, 42);
    expect(searches).toHaveLength(1);
    expect(searches[0]?.id).toBe("123e4567-e89b-12d3-a456-426614174000");
    expect(searches[0]?.userId).toBe(42);
    expect(searches[0]?.filters.hubCity).toBe("Adelaide");
    expect(searches[0]?.alertFrequency).toBe("weekly");
  });

  it("createSavedSearch inserts with jsonb and defaults", async () => {
    const mockRow = {
      id: "123e4567-e89b-12d3-a456-426614174001",
      user_id: "42",
      name: "Visa Sponsors",
      filters: { sponsorship: "current" },
      alert_frequency: "daily",
      last_alerted_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    };
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [mockRow] }),
    } as unknown as Pool;

    const search = await createSavedSearch(pool, 42, {
      name: "Visa Sponsors",
      filters: { sponsorship: "current" },
      alertFrequency: "daily",
    });

    expect(search.name).toBe("Visa Sponsors");
    expect(search.alertFrequency).toBe("daily");
  });

  it("deleteSavedSearch executes deletion query", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rowCount: 1 }),
    } as unknown as Pool;

    const ok = await deleteSavedSearch(pool, 42, "123e4567-e89b-12d3-a456-426614174001");
    expect(ok).toBe(true);
  });
});

describe("watchlists queries", () => {
  it("toggleCompanyWatch deletes when already watching, inserts when not", async () => {
    // 1. When existing
    const poolExisting = {
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes("SELECT 1 FROM watchlists")) {
          return Promise.resolve({ rowCount: 1 });
        }
        return Promise.resolve({ rowCount: 1 });
      }),
    } as unknown as Pool;

    const res1 = await toggleCompanyWatch(poolExisting, 42, "comp-uuid");
    expect(res1.watching).toBe(false);

    // 2. When not existing
    const poolNew = {
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes("SELECT 1 FROM watchlists")) {
          return Promise.resolve({ rowCount: 0 });
        }
        return Promise.resolve({ rowCount: 1 });
      }),
    } as unknown as Pool;

    const res2 = await toggleCompanyWatch(poolNew, 42, "comp-uuid");
    expect(res2.watching).toBe(true);
  });

  it("toggleRegionWatch toggles region watching by sa4Code", async () => {
    const poolNew = {
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes("SELECT 1 FROM watchlists")) {
          return Promise.resolve({ rowCount: 0 });
        }
        return Promise.resolve({ rowCount: 1 });
      }),
    } as unknown as Pool;

    const res = await toggleRegionWatch(poolNew, 42, "401");
    expect(res.watching).toBe(true);
  });
});

describe("userAlerts queries", () => {
  it("listUserAlerts returns unread count and mapped alert items", async () => {
    const pool = {
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.toLowerCase().includes("count(*)")) {
          return Promise.resolve({ rows: [{ count: "2" }] });
        }
        return Promise.resolve({
          rows: [
            {
              id: "alert-1",
              user_id: "42",
              alert_type: "new_job",
              title: "Senior Rust Engineer",
              message: "Canva published a new role in Sydney",
              link: "/companies/canva",
              entity_type: "company",
              entity_id: "canva-uuid",
              read_at: null,
              created_at: new Date(),
            },
          ],
        });
      }),
    } as unknown as Pool;

    const res = await listUserAlerts(pool, 42);
    expect(res.unreadCount).toBe(2);
    expect(res.alerts).toHaveLength(1);
    expect(res.alerts[0]?.title).toBe("Senior Rust Engineer");
  });

  it("markAlertRead marks single alert as read", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rowCount: 1 }),
    } as unknown as Pool;

    const ok = await markAlertRead(pool, 42, "alert-1");
    expect(ok).toBe(true);
  });
});
