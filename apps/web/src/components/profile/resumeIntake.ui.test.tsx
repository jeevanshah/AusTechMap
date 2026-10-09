// @vitest-environment jsdom
// Drives the real components in a DOM to pin the "nothing is saved until you
// confirm" promise from PRODUCT_SPEC.md §12.4.2 and the privacy page: the
// only path to saveCandidateProfileAction is the explicit Confirm & Save
// button, and it saves exactly what the review panel is showing.
import type {
  CandidateProfile,
  CandidateProfileSuggestion,
} from "@austechmap/contracts";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../app/actions/profileActions", () => ({
  saveCandidateProfileAction: vi.fn(),
  deleteCandidateProfileAction: vi.fn(),
}));
// Keep the real ResumeReadError; only the PDF reading itself is stubbed (it
// has its own real-PDF tests in extractSuggestion.test.ts).
vi.mock("../../lib/profile/extractSuggestion", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../lib/profile/extractSuggestion")
  >()),
  suggestFromResume: vi.fn(),
}));

import {
  deleteCandidateProfileAction,
  saveCandidateProfileAction,
} from "../../app/actions/profileActions";
import {
  ResumeReadError,
  suggestFromResume,
} from "../../lib/profile/extractSuggestion";
import { CandidateProfilePanel } from "../../app/(user)/account/CandidateProfilePanel";
import { ResumeIntakeCard } from "./ResumeIntakeCard";
import { ResumeReviewPanel } from "./ResumeReviewPanel";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const ROLE_FAMILIES = [
  { id: "1", key: "software-engineering", label: "Software Engineering" },
  { id: "2", key: "data", label: "Data" },
];
const SKILLS = [
  {
    id: "a",
    key: "typescript",
    label: "TypeScript",
    category: "language",
    aliases: [],
  },
  {
    id: "b",
    key: "python",
    label: "Python",
    category: "language",
    aliases: [],
  },
  {
    id: "c",
    key: "docker",
    label: "Docker",
    category: "devops_tool",
    aliases: [],
  },
];

const TAXONOMY = { roleFamilies: ROLE_FAMILIES, skills: SKILLS };

const SUGGESTION: CandidateProfileSuggestion = {
  roleFamilyKey: "software-engineering",
  roleFamilyLabel: "Software Engineering",
  experienceBand: "senior",
  skills: [
    { key: "typescript", label: "TypeScript" },
    { key: "python", label: "Python" },
  ],
  workStyle: "hybrid",
  workStyleRequired: false,
};

const SAVED: CandidateProfile = {
  userId: 42,
  roleFamilyKey: "software-engineering",
  roleFamilyLabel: "Software Engineering",
  experienceBand: "senior",
  skills: [{ key: "typescript", label: "TypeScript" }],
  workStyle: "hybrid",
  workStyleRequired: false,
  locations: [],
  source: "resume_upload",
  createdAt: "2026-10-09T00:00:00.000Z",
  updatedAt: "2026-10-09T00:00:00.000Z",
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  window.confirm = vi.fn(() => true);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function render(ui: React.ReactElement) {
  await act(async () => {
    root.render(ui);
  });
}

function button(text: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find((b) =>
    (b.textContent ?? "").replace(/\s+/g, " ").trim().includes(text),
  );
  if (!found) throw new Error(`No button containing "${text}"`);
  return found as HTMLButtonElement;
}

async function click(element: Element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("ResumeReviewPanel -- the confirmation gate", () => {
  it("saves nothing just by being shown", async () => {
    await render(
      <ResumeReviewPanel
        suggestion={SUGGESTION}
        roleFamilies={ROLE_FAMILIES}
        skills={SKILLS}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(saveCandidateProfileAction).not.toHaveBeenCalled();
    expect(container.textContent).toContain("TypeScript");
    expect(container.textContent).toContain("Python");
  });

  it("Discard closes without ever saving", async () => {
    const onCancel = vi.fn();
    await render(
      <ResumeReviewPanel
        suggestion={SUGGESTION}
        roleFamilies={ROLE_FAMILIES}
        skills={SKILLS}
        onSaved={vi.fn()}
        onCancel={onCancel}
      />,
    );
    await click(button("Discard"));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(saveCandidateProfileAction).not.toHaveBeenCalled();
  });

  it("Confirm saves exactly what is shown, honouring edits", async () => {
    vi.mocked(saveCandidateProfileAction).mockResolvedValue({
      success: true,
      profile: SAVED,
    });
    const onSaved = vi.fn();
    await render(
      <ResumeReviewPanel
        suggestion={SUGGESTION}
        roleFamilies={ROLE_FAMILIES}
        skills={SKILLS}
        onSaved={onSaved}
        onCancel={vi.fn()}
      />,
    );

    // Un-check Python, add Docker through the search box.
    await click(button("Python"));
    await type(
      container.querySelector(
        'input[placeholder^="Search to add"]',
      ) as HTMLInputElement,
      "dock",
    );
    await click(button("+ Docker"));
    // Add a location.
    await type(
      container.querySelector(
        'input[placeholder="e.g. Sydney"]',
      ) as HTMLInputElement,
      "Sydney",
    );
    await click(button("+ Add"));

    await click(button("Confirm & Save"));

    expect(saveCandidateProfileAction).toHaveBeenCalledOnce();
    expect(saveCandidateProfileAction).toHaveBeenCalledWith({
      roleFamilyKey: "software-engineering",
      experienceBand: "senior",
      skillKeys: ["typescript", "docker"],
      workStyle: "hybrid",
      workStyleRequired: false,
      locations: ["Sydney"],
      source: "resume_upload",
    });
    expect(onSaved).toHaveBeenCalledWith(SAVED);
  });

  it("shows 'not detected' prompts when nothing was inferred", async () => {
    await render(
      <ResumeReviewPanel
        suggestion={{
          roleFamilyKey: null,
          roleFamilyLabel: null,
          experienceBand: "any",
          skills: [],
          workStyle: "any",
          workStyleRequired: false,
        }}
        roleFamilies={ROLE_FAMILIES}
        skills={SKILLS}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(container.textContent).toContain(
      "Not detected — please choose one.",
    );
    expect(container.textContent).toContain("No skills detected");
  });

  it("shows a friendly message if the save call itself fails", async () => {
    vi.mocked(saveCandidateProfileAction).mockRejectedValue(
      new Error("network down"),
    );
    const onSaved = vi.fn();
    await render(
      <ResumeReviewPanel
        suggestion={SUGGESTION}
        roleFamilies={ROLE_FAMILIES}
        skills={SKILLS}
        onSaved={onSaved}
        onCancel={vi.fn()}
      />,
    );
    await click(button("Confirm & Save"));

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "couldn't save your profile",
    );
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("surfaces a save failure and does not report success", async () => {
    vi.mocked(saveCandidateProfileAction).mockResolvedValue({
      success: false,
      error: "Failed to save your profile.",
    });
    const onSaved = vi.fn();
    await render(
      <ResumeReviewPanel
        suggestion={SUGGESTION}
        roleFamilies={ROLE_FAMILIES}
        skills={SKILLS}
        onSaved={onSaved}
        onCancel={vi.fn()}
      />,
    );
    await click(button("Confirm & Save"));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Failed to save your profile.",
    );
    expect(onSaved).not.toHaveBeenCalled();
  });
});

describe("ResumeIntakeCard", () => {
  async function chooseFile(file: File) {
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    Object.defineProperty(input, "files", {
      value: [file],
      configurable: true,
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  it("reads the chosen PDF in the browser and hands back only the suggestion", async () => {
    vi.mocked(suggestFromResume).mockResolvedValue(SUGGESTION);
    const onParsed = vi.fn();
    await render(
      <ResumeIntakeCard
        hasExistingProfile={false}
        taxonomy={TAXONOMY}
        onParsed={onParsed}
      />,
    );
    const file = new File(["%PDF-1.4"], "cv.pdf", { type: "application/pdf" });
    await chooseFile(file);

    expect(suggestFromResume).toHaveBeenCalledWith(file, TAXONOMY);
    expect(onParsed).toHaveBeenCalledWith(SUGGESTION);
    // The file never goes near a server action.
    expect(saveCandidateProfileAction).not.toHaveBeenCalled();
  });

  it("shows a read problem's own message and does not advance", async () => {
    vi.mocked(suggestFromResume).mockRejectedValue(
      new ResumeReadError("Only PDF resumes are supported."),
    );
    const onParsed = vi.fn();
    await render(
      <ResumeIntakeCard
        hasExistingProfile
        taxonomy={TAXONOMY}
        onParsed={onParsed}
      />,
    );
    expect(container.textContent).toContain("Update from a new resume");
    await chooseFile(new File(["x"], "cv.docx"));

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Only PDF resumes are supported.",
    );
    expect(onParsed).not.toHaveBeenCalled();
  });

  it("shows a generic message, not internals, for an unexpected failure", async () => {
    vi.mocked(suggestFromResume).mockRejectedValue(
      new Error("pdf.js exploded at offset 0x1f"),
    );
    const onParsed = vi.fn();
    await render(
      <ResumeIntakeCard
        hasExistingProfile={false}
        taxonomy={TAXONOMY}
        onParsed={onParsed}
      />,
    );
    await chooseFile(new File(["%PDF-1.4"], "cv.pdf"));

    const alert = container.querySelector('[role="alert"]')?.textContent ?? "";
    expect(alert).toContain("couldn't read that file");
    expect(alert).not.toContain("exploded");
    expect(onParsed).not.toHaveBeenCalled();
  });

  it("disables the file input while a read is in progress", async () => {
    let finish!: (value: CandidateProfileSuggestion) => void;
    vi.mocked(suggestFromResume).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await render(
      <ResumeIntakeCard
        hasExistingProfile={false}
        taxonomy={TAXONOMY}
        onParsed={vi.fn()}
      />,
    );
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await chooseFile(new File(["%PDF-1.4"], "cv.pdf"));
    expect(input.disabled).toBe(true);

    await act(async () => finish(SUGGESTION));
    expect(input.disabled).toBe(false);
  });
});

describe("CandidateProfilePanel (account)", () => {
  it("walks upload -> review -> confirm -> shown, then delete", async () => {
    vi.mocked(suggestFromResume).mockResolvedValue(SUGGESTION);
    vi.mocked(saveCandidateProfileAction).mockResolvedValue({
      success: true,
      profile: SAVED,
    });
    vi.mocked(deleteCandidateProfileAction).mockResolvedValue({
      success: true,
    });
    const onProfileChange = vi.fn();

    await render(
      <CandidateProfilePanel
        initialProfile={null}
        roleFamilies={ROLE_FAMILIES}
        skills={SKILLS}
        onProfileChange={onProfileChange}
      />,
    );
    expect(container.textContent).toContain("Analyse my CV");

    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    Object.defineProperty(input, "files", {
      value: [new File(["%PDF-1.4"], "cv.pdf")],
      configurable: true,
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container.textContent).toContain("Review what we found");
    expect(saveCandidateProfileAction).not.toHaveBeenCalled();

    await click(button("Confirm & Save"));
    expect(onProfileChange).toHaveBeenLastCalledWith(SAVED);
    expect(container.textContent).toContain("Candidate profile saved.");
    expect(container.textContent).toContain("Software Engineering");

    await click(
      container.querySelector('button[aria-label="Delete candidate profile"]')!,
    );
    expect(deleteCandidateProfileAction).toHaveBeenCalledOnce();
    expect(onProfileChange).toHaveBeenLastCalledWith(null);
    expect(container.textContent).toContain("Candidate profile deleted.");
  });

  it("a re-upload keeps saved locations and anything the new CV doesn't state", async () => {
    // The new CV detects no role/experience/work style and can never see
    // locations; confirming must not wipe what was saved before.
    vi.mocked(suggestFromResume).mockResolvedValue({
      roleFamilyKey: null,
      roleFamilyLabel: null,
      experienceBand: "any",
      skills: [{ key: "python", label: "Python" }],
      workStyle: "any",
      workStyleRequired: false,
    });
    vi.mocked(saveCandidateProfileAction).mockResolvedValue({
      success: true,
      profile: SAVED,
    });
    await render(
      <CandidateProfilePanel
        initialProfile={{
          ...SAVED,
          roleFamilyKey: "data",
          roleFamilyLabel: "Data",
          experienceBand: "mid",
          workStyle: "remote",
          workStyleRequired: true,
          locations: ["Melbourne"],
        }}
        roleFamilies={ROLE_FAMILIES}
        skills={SKILLS}
      />,
    );

    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    Object.defineProperty(input, "files", {
      value: [new File(["%PDF-1.4"], "cv.pdf")],
      configurable: true,
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await click(button("Confirm & Save"));

    expect(saveCandidateProfileAction).toHaveBeenCalledWith({
      roleFamilyKey: "data",
      experienceBand: "mid",
      skillKeys: ["python"],
      workStyle: "remote",
      workStyleRequired: true,
      locations: ["Melbourne"],
      source: "resume_upload",
    });
  });

  it("keeps the profile and explains if the delete call itself fails", async () => {
    vi.mocked(deleteCandidateProfileAction).mockRejectedValue(
      new Error("network down"),
    );
    const onProfileChange = vi.fn();
    await render(
      <CandidateProfilePanel
        initialProfile={SAVED}
        roleFamilies={ROLE_FAMILIES}
        skills={SKILLS}
        onProfileChange={onProfileChange}
      />,
    );
    await click(
      container.querySelector('button[aria-label="Delete candidate profile"]')!,
    );

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "couldn't delete your profile",
    );
    expect(container.textContent).toContain("Software Engineering");
    expect(onProfileChange).not.toHaveBeenCalled();
  });

  it("does not delete when the user cancels the confirm dialog", async () => {
    window.confirm = vi.fn(() => false);
    await render(
      <CandidateProfilePanel
        initialProfile={SAVED}
        roleFamilies={ROLE_FAMILIES}
        skills={SKILLS}
      />,
    );
    await click(
      container.querySelector('button[aria-label="Delete candidate profile"]')!,
    );
    expect(deleteCandidateProfileAction).not.toHaveBeenCalled();
  });
});
