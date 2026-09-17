/**
 * Validates and sanitizes a callback URL to prevent open redirect vulnerabilities.
 * Only relative paths starting with a single '/' are permitted.
 */
export function sanitizeCallbackUrl(raw: unknown): string {
  if (typeof raw !== "string") return "/account";
  const trimmed = raw.trim();
  if (
    trimmed.startsWith("/") &&
    !trimmed.startsWith("//") &&
    !trimmed.includes("\\")
  ) {
    return trimmed;
  }
  return "/account";
}
