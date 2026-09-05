import { describe, expect, it } from "vitest";

import { parseBboxParams } from "./bbox";

function params(query: string): URLSearchParams {
  return new URLSearchParams(query);
}

describe("parseBboxParams", () => {
  it("parses a valid bbox with a default zoom", () => {
    const result = parseBboxParams(params("bbox=150,-34,152,-33"));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.params.zoom).toBe(4);
      expect(result.params.category).toBeNull();
      expect(result.params.sponsorship).toBe(false);
    }
  });

  it("parses a sponsorship=true param", () => {
    const result = parseBboxParams(
      params("bbox=150,-34,152,-33&sponsorship=true"),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.params.sponsorship).toBe(true);
    }
  });

  it("treats any non-'true' sponsorship value as false", () => {
    const result = parseBboxParams(
      params("bbox=150,-34,152,-33&sponsorship=1"),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.params.sponsorship).toBe(false);
    }
  });

  it("snaps the bbox outward to a coarse grid at low zoom", () => {
    const result = parseBboxParams(
      params("bbox=150.12,-33.91,150.34,-33.75&zoom=4"),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.params.bbox).toEqual({
        west: 150,
        south: -34,
        east: 150.5,
        north: -33.5,
      });
    }
  });

  it("snaps the bbox to a finer grid at high zoom", () => {
    const result = parseBboxParams(
      params("bbox=150.121,-33.911,150.129,-33.909&zoom=12"),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.params.bbox).toEqual({
        west: 150.1,
        south: -33.95,
        east: 150.15,
        north: -33.9,
      });
    }
  });

  it("passes through a category param", () => {
    const result = parseBboxParams(
      params("bbox=150,-34,152,-33&category=fintech"),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.params.category).toBe("fintech");
    }
  });

  it("rejects a missing bbox", () => {
    const result = parseBboxParams(params(""));
    expect(result).toEqual({ ok: false, error: "bbox is required" });
  });

  it("rejects a malformed bbox", () => {
    const result = parseBboxParams(params("bbox=150,-34,152"));
    expect(result.ok).toBe(false);
  });

  it("rejects west >= east", () => {
    const result = parseBboxParams(params("bbox=152,-34,150,-33"));
    expect(result.ok).toBe(false);
  });

  it("rejects south >= north", () => {
    const result = parseBboxParams(params("bbox=150,-33,152,-34"));
    expect(result.ok).toBe(false);
  });

  it("rejects out-of-range longitude/latitude", () => {
    const result = parseBboxParams(params("bbox=-200,-34,152,-33"));
    expect(result.ok).toBe(false);
  });

  it("rejects a non-integer zoom", () => {
    const result = parseBboxParams(params("bbox=150,-34,152,-33&zoom=4.5"));
    expect(result.ok).toBe(false);
  });

  it("rejects a zoom outside 0-22", () => {
    const result = parseBboxParams(params("bbox=150,-34,152,-33&zoom=30"));
    expect(result.ok).toBe(false);
  });

  it("treats a blank category as no category", () => {
    const result = parseBboxParams(params("bbox=150,-34,152,-33&category=  "));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.params.category).toBeNull();
    }
  });
});
