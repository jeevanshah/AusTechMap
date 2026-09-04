/**
 * ABN/ACN checksum validation, ported from
 * workers/ingestion/src/austechmap_ingestion/employers/normalisation.py —
 * same algorithms, same verified worked examples (ABN 51 824 753 556 from
 * abr.business.gov.au/Help/AbnFormat; ACN 004 085 616 hand-recomputed).
 * Kept here only for the admin create/edit form's immediate feedback; the
 * database's own CHECK constraints enforce format (not checksum) as the
 * real backstop, and the Python ingestion pipeline is the source of truth
 * for any batch-derived data.
 */

const ABN_WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
const ACN_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 1];

function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function normaliseAbn(raw: string): string | null {
  const digits = digitsOnly(raw);
  if (digits.length !== 11) return null;
  const firstDigit = Number(digits[0]) - 1;
  if (firstDigit < 0) return null;
  const adjusted = [firstDigit, ...digits.slice(1).split("").map(Number)];
  // Non-null: adjusted always has exactly 11 entries (checked above), the
  // same length as ABN_WEIGHTS, so every index is in bounds.
  const total = adjusted.reduce(
    (sum, digit, index) => sum + digit * ABN_WEIGHTS[index]!,
    0,
  );
  return total % 89 === 0 ? digits : null;
}

export function normaliseAcn(raw: string): string | null {
  const digits = digitsOnly(raw);
  if (digits.length !== 9) return null;
  const body = digits.slice(0, 8).split("").map(Number);
  const checkDigit = Number(digits[8]);
  // Non-null: body always has exactly 8 entries (sliced above), the same
  // length as ACN_WEIGHTS, so every index is in bounds.
  const total = body.reduce(
    (sum, digit, index) => sum + digit * ACN_WEIGHTS[index]!,
    0,
  );
  const expected = (10 - (total % 10)) % 10;
  return expected === checkDigit ? digits : null;
}
