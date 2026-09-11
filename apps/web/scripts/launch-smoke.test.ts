import { describe, expect, it } from "vitest";

import {
  SMOKE_CHECKS,
  checkEndpoint,
  normaliseBaseUrl,
  runLaunchSmoke,
} from "./launch-smoke.mjs";

describe("launch smoke", () => {
  it("normalises a canonical HTTPS deployment URL", () => {
    expect(normaliseBaseUrl("https://app.example.com/")).toBe(
      "https://app.example.com",
    );
  });

  it("rejects insecure and credential-bearing URLs", () => {
    expect(() => normaliseBaseUrl("http://app.example.com")).toThrow(/HTTPS/);
    expect(() => normaliseBaseUrl("https://user:pass@app.example.com")).toThrow(
      /credentials/,
    );
  });

  it("rejects an unhealthy deep health response", async () => {
    const healthCheck = SMOKE_CHECKS.find(
      (check) => check.path === "/api/health?deep=true",
    );
    expect(healthCheck).toBeDefined();

    await expect(
      checkEndpoint(healthCheck!, "https://app.example.com", async () =>
        Response.json({
          service: "web",
          status: "degraded",
          diagnostics: { database: "disconnected" },
        }),
      ),
    ).rejects.toThrow(/not healthy/);
  });

  it("checks the public pages and connected health endpoint", async () => {
    const requestedPaths: string[] = [];
    const result = await runLaunchSmoke(
      "https://app.example.com",
      async (input: RequestInfo | URL) => {
        const url =
          input instanceof URL
            ? input
            : new URL(typeof input === "string" ? input : input.url);
        requestedPaths.push(url.pathname + url.search);
        if (url.pathname === "/api/health") {
          return Response.json({
            service: "web",
            status: "ok",
            diagnostics: { database: "connected" },
          });
        }
        if (url.pathname.startsWith("/api/")) {
          return Response.json({ version: 1, hubs: [] });
        }
        return new Response(
          "<!doctype html><title>Australia Tech Map</title>",
          {
            headers: { "content-type": "text/html; charset=utf-8" },
          },
        );
      },
    );

    expect(requestedPaths).toEqual(SMOKE_CHECKS.map((check) => check.path));
    expect(result.results).toHaveLength(SMOKE_CHECKS.length);
  });
});
