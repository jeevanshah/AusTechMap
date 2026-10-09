import type { CandidateProfileSuggestion } from "@austechmap/contracts";

import {
  MAX_RESUME_BYTES,
  MAX_RESUME_PAGES,
  MAX_RESUME_TEXT_CHARS,
  MIN_READABLE_CHARS,
} from "./limits";
import {
  classifyExperienceBand,
  classifyRoleFamily,
  classifyWorkStyle,
  extractSkillMatches,
  type SkillCandidate,
} from "./resumeClassifiers";

/**
 * Reads a resume PDF entirely in the user's browser and suggests profile
 * fields from it (Applicant Velocity P1, PRODUCT_SPEC.md §12.4.2).
 *
 * The file is never uploaded: no server ever sees the PDF or its text, which
 * also means no server has to parse untrusted PDFs. Only the structured
 * suggestion this returns -- after the user reviews and confirms it -- is ever
 * sent anywhere, via saveCandidateProfileAction.
 */

export interface ResumeTaxonomy {
  roleFamilies: ReadonlyArray<{ key: string; label: string }>;
  skills: readonly SkillCandidate[];
}

/** An error whose message is safe and useful to show to the user as-is. */
export class ResumeReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResumeReadError";
  }
}

const UNREADABLE_MESSAGE =
  "We couldn't read that PDF in your browser. Make sure it's a text-based PDF (not a scan or password-protected) and try again.";
const PDF_MAGIC_BYTES = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

function looksLikePdf(bytes: Uint8Array): boolean {
  return (
    bytes.length >= PDF_MAGIC_BYTES.length &&
    PDF_MAGIC_BYTES.every((byte, index) => bytes[index] === byte)
  );
}

async function readPdfText(bytes: Uint8Array): Promise<string> {
  // Loaded on demand: PDF.js is large and only needed once a file is chosen.
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  try {
    if (pdf.numPages > MAX_RESUME_PAGES) {
      throw new ResumeReadError(
        `Resumes longer than ${MAX_RESUME_PAGES} pages aren't supported.`,
      );
    }
    const { text } = await extractText(pdf, { mergePages: true });
    return text.slice(0, MAX_RESUME_TEXT_CHARS);
  } finally {
    // The document proxy has no destroy(); the loading task owns teardown.
    await pdf.loadingTask.destroy();
  }
}

export async function suggestFromResume(
  file: Blob,
  taxonomy: ResumeTaxonomy,
  now: Date = new Date(),
): Promise<CandidateProfileSuggestion> {
  if (file.size === 0) throw new ResumeReadError("That file is empty.");
  if (file.size > MAX_RESUME_BYTES) {
    throw new ResumeReadError(
      `Resume files must be ${MAX_RESUME_BYTES / (1024 * 1024)}MB or smaller.`,
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!looksLikePdf(bytes)) {
    throw new ResumeReadError("Only PDF resumes are supported.");
  }

  let text: string;
  try {
    text = await readPdfText(bytes);
  } catch (error) {
    if (error instanceof ResumeReadError) throw error;
    throw new ResumeReadError(UNREADABLE_MESSAGE);
  }
  if (text.trim().length < MIN_READABLE_CHARS) {
    throw new ResumeReadError(
      "We couldn't find any readable text in that PDF. If it's a scan, export a text-based PDF and try again.",
    );
  }

  const roleFamilyKey = classifyRoleFamily(text);
  return {
    roleFamilyKey,
    roleFamilyLabel:
      taxonomy.roleFamilies.find((family) => family.key === roleFamilyKey)
        ?.label ?? null,
    experienceBand: classifyExperienceBand(text, now),
    skills: extractSkillMatches(text, taxonomy.skills),
    ...classifyWorkStyle(text),
  };
}
