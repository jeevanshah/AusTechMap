import type { Pool } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DatabaseNotConfiguredError, getPool } from "../../../../lib/db";
import { GET } from "./route";

vi.mock("../../../../lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../lib/db")>();
  return { ...actual, getPool: vi.fn() };
});

function fakePool(...results: unknown[][]): Pool {
  const query = vi.fn();
  for (const rows of results) {
    query.mockResolvedValueOnce({ rows });
  }
  return { query } as unknown as Pool;
}

function request(query: string): Request {
  return new Request(`http://localhost/api/search/companies?${query}`);
}

describe("GET /api/search/companies", () => {
  beforeEach(() => {
    vi.mocked(getPool).mockReset();
  });

  it("returns a name match", async () => {
    vi.mocked(getPool).mockReturnValue(
      fakePool([
        {
          slug: "acme",
          name: "Acme",
          domain: "acme.example.com",
          name_score: 0.9,
          alias_score: null,
          matched_alias: null,
          city: "Sydney",
          primary_category: "Fintech",
          has_sponsorship_evidence: true,
        },
      ]),
    );

    const response = await GET(request("q=acme"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toEqual([
      {
        slug: "acme",
        name: "Acme",
        domain: "acme.example.com",
        matchType: "name",
        matchedText: null,
        score: 0.9,
        city: "Sydney",
        primaryCategory: "Fintech",
        hasSponsorshipEvidence: true,
      },
    ]);
  });

  it("prefers an alias match when its score is higher", async () => {
    vi.mocked(getPool).mockReturnValue(
      fakePool([
        {
          slug: "acme",
          name: "Acme Technologies",
          domain: "acme.example.com",
          name_score: 0.2,
          alias_score: 0.95,
          matched_alias: "Acme Tech",
          city: null,
          primary_category: null,
          has_sponsorship_evidence: false,
        },
      ]),
    );

    const response = await GET(request("q=acme+tech"));
    const body = await response.json();

    expect(body.results).toEqual([
      {
        slug: "acme",
        name: "Acme Technologies",
        domain: "acme.example.com",
        matchType: "alias",
        matchedText: "Acme Tech",
        score: 0.95,
        city: null,
        primaryCategory: null,
        hasSponsorshipEvidence: false,
      },
    ]);
  });

  it("falls back to a location text match when nothing matches by name/alias", async () => {
    vi.mocked(getPool).mockReturnValue(
      fakePool(
        [],
        [
          {
            slug: "acme",
            name: "Acme",
            domain: "acme.example.com",
            input_text: "1 George Street, Sydney NSW 2000, Australia",
            city: null,
            primary_category: null,
            has_sponsorship_evidence: false,
          },
        ],
      ),
    );

    const response = await GET(request("q=Sydney"));
    const body = await response.json();

    expect(body.results).toEqual([
      {
        slug: "acme",
        name: "Acme",
        domain: "acme.example.com",
        matchType: "location",
        matchedText: "1 George Street, Sydney NSW 2000, Australia",
        score: 0.5,
        city: null,
        primaryCategory: null,
        hasSponsorshipEvidence: false,
      },
    ]);
  });

  it("returns an empty result set for no match at all", async () => {
    vi.mocked(getPool).mockReturnValue(fakePool([], []));

    const response = await GET(request("q=quantum+blockchain+astronaut"));
    const body = await response.json();

    expect(body.results).toEqual([]);
  });

  it("forwards a category filter to the query", async () => {
    const pool = fakePool([]);
    vi.mocked(getPool).mockReturnValue(pool);

    await GET(request("q=acme&category=fintech"));

    expect(pool.query).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(["acme", "fintech", false]),
    );
  });

  it("treats a blank category as no filter", async () => {
    const pool = fakePool([]);
    vi.mocked(getPool).mockReturnValue(pool);

    await GET(request("q=acme&category="));

    expect(pool.query).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(["acme", null, false]),
    );
  });

  it("forwards a sponsorship filter to the query", async () => {
    const pool = fakePool([]);
    vi.mocked(getPool).mockReturnValue(pool);

    await GET(request("q=acme&sponsorship=true"));

    expect(pool.query).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(["acme", true]),
    );
  });

  it("returns 400 for a missing query", async () => {
    const response = await GET(request(""));
    expect(response.status).toBe(400);
    expect(getPool).not.toHaveBeenCalled();
  });

  it("returns 503 when the database is not configured", async () => {
    vi.mocked(getPool).mockImplementation(() => {
      throw new DatabaseNotConfiguredError();
    });

    const response = await GET(request("q=acme"));

    expect(response.status).toBe(503);
  });
});
