// Limits for reading a resume in the browser (see extractSuggestion.ts).
// Nothing here is a server-side control: the PDF never leaves the user's
// device, so these only keep the user's own tab responsive.
export const MAX_RESUME_BYTES = 5 * 1024 * 1024;
export const MAX_RESUME_PAGES = 15;
// Extracted text beyond this is ignored. A real resume is a few thousand
// characters; a crafted PDF can pack millions into 5MB.
export const MAX_RESUME_TEXT_CHARS = 100_000;
// Below this a PDF is treated as having no readable text (e.g. a scan).
export const MIN_READABLE_CHARS = 40;

// Mirror CANDIDATE_PROFILE_LIMITS in @austechmap/contracts (limits.test.ts
// fails if they drift). Duplicated rather than imported because importing a
// runtime value from the contracts package would pull zod into the client
// bundle of the review panel.
export const MAX_PROFILE_LOCATIONS = 20;
export const MAX_PROFILE_LOCATION_CHARS = 80;
