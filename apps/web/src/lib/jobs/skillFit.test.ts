import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  computeSkillFit,
  DESCRIPTION_MATCH_CONFIDENCE,
  MAX_LEAD_WITH,
  MAX_MISSING_SHOWN,
  TITLE_MATCH_CONFIDENCE,
} from "./skillFit";

const skill = (key: string, confidence = 0.5) => ({
  key,
  label: key.toUpperCase(),
  confidence,
});

describe("computeSkillFit", () => {
  it("splits posting skills into matched and not-in-profile", () => {
    const fit = computeSkillFit(
      [skill("ts", 0.7), skill("go"), skill("aws")],
      ["ts", "aws", "python"],
    );
    expect(fit?.matched.map((s) => s.key)).toEqual(["ts", "aws"]);
    expect(fit?.missing.map((s) => s.key)).toEqual(["go"]);
    expect(fit?.statedTotal).toBe(3);
    expect(fit?.missingTotal).toBe(1);
  });

  it("describes evidence: title-named vs description-found", () => {
    const fit = computeSkillFit(
      [
        skill("ts", TITLE_MATCH_CONFIDENCE),
        skill("go", DESCRIPTION_MATCH_CONFIDENCE),
      ],
      ["ts", "go"],
    );
    expect(fit?.matched).toEqual([
      { key: "ts", label: "TS", evidence: "job title" },
      { key: "go", label: "GO", evidence: "job description" },
    ]);
  });

  it("puts title-named matched skills first in leadWith and caps it", () => {
    const fit = computeSkillFit(
      [
        skill("a", 0.5),
        skill("b", 0.5),
        skill("c", 0.5),
        skill("d", 0.5),
        skill("t", 0.7),
      ],
      ["a", "b", "c", "d", "t"],
    );
    expect(fit?.leadWith).toHaveLength(MAX_LEAD_WITH);
    expect(fit?.leadWith[0]?.key).toBe("t");
  });

  it("caps the missing list but reports the true total", () => {
    const many = Array.from({ length: 12 }, (_, i) => skill(`s${i}`));
    const fit = computeSkillFit([...many, skill("mine", 0.7)], ["mine"]);
    expect(fit?.missing).toHaveLength(MAX_MISSING_SHOWN);
    expect(fit?.missingTotal).toBe(12);
    expect(fit?.statedTotal).toBe(13);
  });

  it("de-duplicates repeated posting skills", () => {
    const fit = computeSkillFit([skill("ts", 0.7), skill("ts", 0.5)], ["ts"]);
    expect(fit?.matched).toHaveLength(1);
    expect(fit?.statedTotal).toBe(1);
  });

  it("returns null rather than a 0% score when there is nothing to compare", () => {
    expect(computeSkillFit([], ["ts"])).toBeNull();
    expect(computeSkillFit([skill("ts")], [])).toBeNull();
  });

  it("is deterministic regardless of input order", () => {
    const a = computeSkillFit([skill("x"), skill("y"), skill("z", 0.7)], ["y"]);
    const b = computeSkillFit([skill("z", 0.7), skill("y"), skill("x")], ["y"]);
    expect(a).toEqual(b);
  });

  it("keeps the mirrored confidences in sync with the ingestion worker", () => {
    const source = readFileSync(
      resolve(
        __dirname,
        "../../../../../workers/ingestion/src/austechmap_ingestion/hiring/normalisation.py",
      ),
      "utf8",
    );
    expect(source).toContain(
      `_TITLE_MATCH_CONFIDENCE = ${TITLE_MATCH_CONFIDENCE}`,
    );
    expect(source).toContain(
      `_DESCRIPTION_MATCH_CONFIDENCE = ${DESCRIPTION_MATCH_CONFIDENCE}`,
    );
  });
});
