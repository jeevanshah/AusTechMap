import { describe, expect, it, vi } from "vitest";

function mockHeaders(entries: Record<string, string>) {
  vi.doMock("next/headers", () => ({
    headers: async () => ({
      get: (name: string) => entries[name] ?? null,
    }),
  }));
}

describe("currentClientIp", () => {
  it("prefers x-vercel-forwarded-for over the other headers", async () => {
    mockHeaders({
      "x-vercel-forwarded-for": "203.0.113.1",
      "x-forwarded-for": "198.51.100.1",
      "x-real-ip": "192.0.2.1",
    });
    const { currentClientIp } = await import("./request-ip");
    expect(await currentClientIp()).toBe("203.0.113.1");
  });

  it("falls back to x-forwarded-for when x-vercel-forwarded-for is absent", async () => {
    vi.resetModules();
    mockHeaders({
      "x-forwarded-for": "198.51.100.1",
      "x-real-ip": "192.0.2.1",
    });
    const { currentClientIp } = await import("./request-ip");
    expect(await currentClientIp()).toBe("198.51.100.1");
  });

  it("falls back to x-real-ip when the forwarded-for headers are absent", async () => {
    vi.resetModules();
    mockHeaders({ "x-real-ip": "192.0.2.1" });
    const { currentClientIp } = await import("./request-ip");
    expect(await currentClientIp()).toBe("192.0.2.1");
  });

  it("returns 'unknown' when no IP header is present at all", async () => {
    vi.resetModules();
    mockHeaders({});
    const { currentClientIp } = await import("./request-ip");
    expect(await currentClientIp()).toBe("unknown");
  });

  it("takes the first entry of a comma-separated proxy chain and trims it", async () => {
    vi.resetModules();
    mockHeaders({ "x-forwarded-for": "  203.0.113.7  , 10.0.0.1, 10.0.0.2" });
    const { currentClientIp } = await import("./request-ip");
    expect(await currentClientIp()).toBe("203.0.113.7");
  });

  it("skips an empty leading entry in a comma-separated value rather than returning an empty string", async () => {
    vi.resetModules();
    mockHeaders({ "x-forwarded-for": " , 203.0.113.7" });
    const { currentClientIp } = await import("./request-ip");
    expect(await currentClientIp()).toBe("203.0.113.7");
  });

  it("falls through to the next header when a header is present but entirely empty/whitespace", async () => {
    vi.resetModules();
    mockHeaders({
      "x-vercel-forwarded-for": "   ",
      "x-forwarded-for": "198.51.100.1",
    });
    const { currentClientIp } = await import("./request-ip");
    expect(await currentClientIp()).toBe("198.51.100.1");
  });

  it("never returns an empty string even if every header is blank", async () => {
    vi.resetModules();
    mockHeaders({
      "x-vercel-forwarded-for": " ",
      "x-forwarded-for": " , ",
      "x-real-ip": "",
    });
    const { currentClientIp } = await import("./request-ip");
    expect(await currentClientIp()).toBe("unknown");
  });
});
