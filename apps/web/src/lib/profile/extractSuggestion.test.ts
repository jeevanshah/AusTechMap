import { describe, expect, it } from "vitest";

import { MAX_RESUME_PAGES, MAX_RESUME_TEXT_CHARS } from "./limits";
import {
  ResumeReadError,
  suggestFromResume,
  type ResumeTaxonomy,
} from "./extractSuggestion";

// These run the real PDF.js build (via unpdf) on real PDF bytes. A mocked
// parser once hid a method the types promised but the runtime lacked, so
// every read failed; a change in unpdf's API should fail here instead.

const NOW = new Date("2026-10-09T00:00:00Z");

/** A minimal PDF with one page per entry and a byte-accurate xref table. */
function buildPdf(pages: string[][]): Uint8Array {
  const escape = (text: string) => text.replace(/([\\()])/g, "\\$1");
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages
      .map((_, index) => `${4 + index * 2} 0 R`)
      .join(" ")}] /Count ${pages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  pages.forEach((lines, index) => {
    const stream = [
      "BT",
      "/F1 11 Tf",
      "50 780 Td",
      "14 TL",
      ...lines.map((line) => `(${escape(line)}) Tj T*`),
      "ET",
    ].join("\n");
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${5 + index * 2} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`,
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    );
  });

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

function blobOf(bytes: Uint8Array): Blob {
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}

const TAXONOMY: ResumeTaxonomy = {
  roleFamilies: [
    { key: "software-engineering", label: "Software Engineering" },
  ],
  skills: [
    { key: "typescript", label: "TypeScript", aliases: ["TS"] },
    { key: "csharp", label: "C#", aliases: ["C Sharp"] },
    { key: "dotnet", label: ".NET", aliases: ["ASP.NET"] },
    { key: "golang", label: "Go", aliases: ["Golang"] },
    { key: "rust", label: "Rust", aliases: [] },
    { key: "python", label: "Python", aliases: [] },
  ],
};

async function failureOf(promise: Promise<unknown>): Promise<ResumeReadError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ResumeReadError);
    return error as ResumeReadError;
  }
  throw new Error("expected the read to fail");
}

describe("suggestFromResume with the real PDF parser", () => {
  it("extracts and classifies a real PDF", async () => {
    const pdf = buildPdf([
      [
        "Jane Example",
        "Senior Software Engineer",
        "Sydney NSW",
        "Backend engineer. Delivered C# and .NET services and TypeScript tooling.",
        "No experience with Rust. Go live of the payments platform.",
        "Open to hybrid roles.",
      ],
    ]);

    const suggestion = await suggestFromResume(blobOf(pdf), TAXONOMY, NOW);

    expect(suggestion).toEqual({
      roleFamilyKey: "software-engineering",
      roleFamilyLabel: "Software Engineering",
      experienceBand: "senior",
      // Rust is negated and "Go live" is everyday English, so neither
      // appears; C# and .NET (punctuation-edged names) do.
      skills: [
        { key: "typescript", label: "TypeScript" },
        { key: "csharp", label: "C#" },
        { key: "dotnet", label: ".NET" },
      ],
      workStyle: "hybrid",
      workStyleRequired: false,
    });
  });

  it("reads every page of a multi-page resume", async () => {
    const pdf = buildPdf([
      ["Jane Example", "Backend engineer with Python experience."],
      ["Projects", "Open-source TypeScript tooling."],
    ]);

    const suggestion = await suggestFromResume(blobOf(pdf), TAXONOMY, NOW);

    expect(suggestion.skills.map((skill) => skill.key)).toEqual([
      "typescript",
      "python",
    ]);
  });

  it("only examines the first MAX_RESUME_TEXT_CHARS characters", async () => {
    // A crafted PDF can pack millions of characters into the size limit.
    const pdf = buildPdf([
      [`Python ${"x".repeat(MAX_RESUME_TEXT_CHARS)} TypeScript Python`],
    ]);

    const suggestion = await suggestFromResume(blobOf(pdf), TAXONOMY, NOW);

    expect(suggestion.skills).toEqual([{ key: "python", label: "Python" }]);
  });

  it("explains when a PDF has no readable text (e.g. a scan)", async () => {
    const error = await failureOf(
      suggestFromResume(blobOf(buildPdf([[]])), TAXONOMY, NOW),
    );
    expect(error.message).toMatch(/readable text/);
  });

  it("rejects a document over the page cap", async () => {
    const pages = Array.from({ length: MAX_RESUME_PAGES + 1 }, () => [
      "A page of ordinary resume text.",
    ]);
    const error = await failureOf(
      suggestFromResume(blobOf(buildPdf(pages)), TAXONOMY, NOW),
    );
    expect(error.message).toContain(`${MAX_RESUME_PAGES} pages`);
  });

  it("rejects corrupt PDF bytes with a friendly message", async () => {
    const corrupt = new TextEncoder().encode(
      "%PDF-1.4\n1 0 obj\n<< not a real pdf >>\nendobj\n",
    );
    const error = await failureOf(
      suggestFromResume(blobOf(corrupt), TAXONOMY, NOW),
    );
    expect(error.message).toMatch(/couldn't read that PDF/);
  });

  it("rejects an empty file, a non-PDF, and an oversized file up front", async () => {
    expect(
      (await failureOf(suggestFromResume(new Blob([]), TAXONOMY, NOW))).message,
    ).toMatch(/empty/);

    const notPdf = new Blob([new TextEncoder().encode("not a pdf")]);
    expect(
      (await failureOf(suggestFromResume(notPdf, TAXONOMY, NOW))).message,
    ).toMatch(/Only PDF/);

    const oversized = new Blob([new Uint8Array(6 * 1024 * 1024)]);
    expect(
      (await failureOf(suggestFromResume(oversized, TAXONOMY, NOW))).message,
    ).toMatch(/5MB or smaller/);
  });
});
