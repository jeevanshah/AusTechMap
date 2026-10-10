import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import { listJobSkills } from "./jobSkills";

describe("listJobSkills", () => {
  it("groups rows by job and converts NUMERIC confidence strings to numbers", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        { job_id: "j1", key: "ts", label: "TypeScript", confidence: "0.70" },
        { job_id: "j1", key: "go", label: "Go", confidence: "0.50" },
        { job_id: "j2", key: "aws", label: "AWS", confidence: "0.50" },
      ],
    });

    const result = await listJobSkills({ query } as unknown as Pool, [
      "j1",
      "j2",
      "j3",
    ]);

    expect(query.mock.calls[0]?.[1]).toEqual([["j1", "j2", "j3"]]);
    expect(result.get("j1")).toEqual([
      { key: "ts", label: "TypeScript", confidence: 0.7 },
      { key: "go", label: "Go", confidence: 0.5 },
    ]);
    expect(result.get("j2")).toHaveLength(1);
    expect(result.has("j3")).toBe(false);
  });

  it("does not query when there are no jobs", async () => {
    const query = vi.fn();
    expect((await listJobSkills({ query } as unknown as Pool, [])).size).toBe(
      0,
    );
    expect(query).not.toHaveBeenCalled();
  });
});
