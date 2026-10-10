// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { computeSkillFit } from "../../lib/jobs/skillFit";
import { SkillFitPanel } from "./SkillFitPanel";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(fit: NonNullable<ReturnType<typeof computeSkillFit>>) {
  act(() => root.render(<SkillFitPanel fit={fit} />));
}

describe("SkillFitPanel", () => {
  it("shows matched skills with evidence, a lead-with line, and not-in-profile skills", () => {
    const fit = computeSkillFit(
      [
        { key: "ts", label: "TypeScript", confidence: 0.7 },
        { key: "go", label: "Go", confidence: 0.5 },
      ],
      ["ts"],
    )!;
    render(fit);

    const text = container.textContent ?? "";
    expect(text).toContain("1 of 2 skills we found are in your profile");
    expect(text).toContain("TypeScript");
    expect(text).toContain("job title");
    expect(text).toContain("Lead with: TypeScript");
    expect(text).toContain("Not in your profile");
    expect(text).toContain("Go");
  });

  it("is honest about its limits and never claims a hiring chance or CV access", () => {
    const fit = computeSkillFit(
      [{ key: "ts", label: "TypeScript", confidence: 0.7 }],
      ["ts"],
    )!;
    render(fit);
    const text = container.textContent ?? "";
    expect(text).toContain("may be incomplete");
    expect(text).toContain("not a prediction of whether you will be hired");
    expect(text).toContain("We never see your CV");
    expect(text).not.toMatch(/\d+\s*%/);
  });

  it("handles a posting where none of the skills are in the profile", () => {
    const fit = computeSkillFit(
      [{ key: "go", label: "Go", confidence: 0.5 }],
      ["ts"],
    )!;
    render(fit);
    const text = container.textContent ?? "";
    expect(text).toContain("None of the 1 skill we found is in your profile");
    expect(text).not.toContain("Lead with");
    expect(text).not.toContain("In your profile");
  });

  it("renders as a native details element, collapsed by default (no client JS needed)", () => {
    const fit = computeSkillFit(
      [{ key: "ts", label: "TypeScript", confidence: 0.7 }],
      ["ts"],
    )!;
    render(fit);
    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    expect(details?.hasAttribute("open")).toBe(false);
  });
});
