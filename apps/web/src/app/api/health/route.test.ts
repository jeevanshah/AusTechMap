import type { Pool } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getPool } from "../../../lib/db";
import { GET } from "./route";

vi.mock("../../../lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/db")>();
  return { ...actual, getPool: vi.fn() };
});

function fakePool(rows: unknown[]): Pool {
  return { query: vi.fn().mockResolvedValue({ rows }) } as unknown as Pool;
}

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.mocked(getPool).mockReset();
  });

  it("returns the versioned web health contract for shallow check", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      service: "web",
      status: "ok",
      version: 1,
    });
  });

  it("returns deep health diagnostics when requested with deep=true", async () => {
    vi.mocked(getPool).mockReturnValue(
      fakePool([{ filename: "0018_change_events_and_notification_delivery.sql" }]),
    );

    const request = new Request("http://localhost/api/health?deep=true");
    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body.diagnostics.database).toBe("connected");
    expect(body.diagnostics.latestMigration).toBe(
      "0018_change_events_and_notification_delivery.sql",
    );
  });

  it("returns 503 degraded status when deep check database query throws", async () => {
    vi.mocked(getPool).mockReturnValue({
      query: vi.fn().mockRejectedValue(new Error("Connection refused")),
    } as unknown as Pool);

    const request = new Request("http://localhost/api/health?deep=true");
    const response = await GET(request);

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.status).toBe("degraded");
    expect(body.diagnostics.database).toBe("disconnected");
  });
});
