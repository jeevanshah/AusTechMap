import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../../lib/auth/require-role", () => ({ requireUser: vi.fn() }));
vi.mock("../../lib/db", () => ({ getPool: vi.fn(() => ({})) }));

vi.mock("../../lib/queries/savedSearches", () => ({
  createSavedSearch: vi.fn(),
  deleteSavedSearch: vi.fn(),
  updateSavedSearchAlertFrequency: vi.fn(),
  pauseAllSavedSearches: vi.fn(),
  resumeAllSavedSearches: vi.fn(),
}));

vi.mock("../../lib/queries/watchlists", () => ({
  removeWatchlistEntry: vi.fn(),
  toggleCompanyWatch: vi.fn(),
  toggleRegionWatch: vi.fn(),
  updateWatchlistNotes: vi.fn(),
}));

vi.mock("../../lib/queries/userAlerts", () => ({
  markAlertRead: vi.fn(),
  markAllAlertsRead: vi.fn(),
}));

import { requireUser } from "../../lib/auth/require-role";
import {
  createSavedSearch,
  deleteSavedSearch,
  pauseAllSavedSearches,
  resumeAllSavedSearches,
  updateSavedSearchAlertFrequency,
} from "../../lib/queries/savedSearches";
import {
  removeWatchlistEntry,
  toggleCompanyWatch,
  toggleRegionWatch,
  updateWatchlistNotes,
} from "../../lib/queries/watchlists";
import { markAlertRead, markAllAlertsRead } from "../../lib/queries/userAlerts";
import {
  deleteSavedSearchAction,
  markAlertReadAction,
  markAllAlertsReadAction,
  pauseAllSavedSearchesAction,
  removeWatchlistEntryAction,
  resumeAllSavedSearchesAction,
  saveSearchAction,
  toggleCompanyWatchAction,
  toggleRegionWatchAction,
  toggleWatchlistMuteAction,
  updateSavedSearchFrequencyAction,
  updateWatchlistNotesAction,
} from "./retentionActions";

function fakeActor() {
  return {
    id: 42,
    email: "test@example.com",
    role: "user" as const,
    mfaVerifiedAt: null,
  };
}

describe("retentionActions", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockReset().mockResolvedValue(fakeActor());
  });

  describe("saved searches actions", () => {
    it("saveSearchAction creates and revalidates", async () => {
      vi.mocked(createSavedSearch).mockResolvedValue({
        id: "search-1",
        userId: 42,
        name: "DevOps Melbourne",
        filters: { hubCity: "Melbourne" },
        alertFrequency: "weekly",
        lastAlertedAt: null,
        createdAt: "2026-09-08T00:00:00Z",
        updatedAt: "2026-09-08T00:00:00Z",
      });

      const res = await saveSearchAction("DevOps Melbourne", { hubCity: "Melbourne" }, "weekly");
      expect(res.success).toBe(true);
      expect(res.search?.name).toBe("DevOps Melbourne");
    });

    it("deleteSavedSearchAction deletes search", async () => {
      vi.mocked(deleteSavedSearch).mockResolvedValue(true);
      const res = await deleteSavedSearchAction("search-1");
      expect(res.success).toBe(true);
    });

    it("updateSavedSearchFrequencyAction updates alert cadence", async () => {
      vi.mocked(updateSavedSearchAlertFrequency).mockResolvedValue(true);
      const res = await updateSavedSearchFrequencyAction("search-1", "instant");
      expect(res.success).toBe(true);
    });

    it("pauseAllSavedSearchesAction pauses all searches", async () => {
      vi.mocked(pauseAllSavedSearches).mockResolvedValue(5);
      const res = await pauseAllSavedSearchesAction();
      expect(res.success).toBe(true);
      expect(res.count).toBe(5);
    });

    it("resumeAllSavedSearchesAction resumes all searches", async () => {
      vi.mocked(resumeAllSavedSearches).mockResolvedValue(3);
      const res = await resumeAllSavedSearchesAction("weekly");
      expect(res.success).toBe(true);
      expect(res.count).toBe(3);
    });
  });

  describe("watchlists actions", () => {
    it("toggleCompanyWatchAction toggles watching status", async () => {
      vi.mocked(toggleCompanyWatch).mockResolvedValue({ watching: true });
      const res = await toggleCompanyWatchAction("company-uuid");
      expect(res.success).toBe(true);
      expect(res.watching).toBe(true);
    });

    it("toggleRegionWatchAction toggles region status", async () => {
      vi.mocked(toggleRegionWatch).mockResolvedValue({ watching: false });
      const res = await toggleRegionWatchAction("401");
      expect(res.success).toBe(true);
      expect(res.watching).toBe(false);
    });

    it("removeWatchlistEntryAction removes item", async () => {
      vi.mocked(removeWatchlistEntry).mockResolvedValue(true);
      const res = await removeWatchlistEntryAction("entry-uuid");
      expect(res.success).toBe(true);
    });

    it("updateWatchlistNotesAction updates custom note memo", async () => {
      vi.mocked(updateWatchlistNotes).mockResolvedValue(true);
      const res = await updateWatchlistNotesAction("entry-uuid", "Spoke with hiring manager");
      expect(res.success).toBe(true);
    });

    it("toggleWatchlistMuteAction updates muted state in notes JSON", async () => {
      vi.mocked(updateWatchlistNotes).mockResolvedValue(true);
      const res = await toggleWatchlistMuteAction(
        "entry-uuid",
        JSON.stringify({ memo: "Applied" }),
        true,
      );
      expect(res.success).toBe(true);
      expect(updateWatchlistNotes).toHaveBeenCalledWith(
        expect.anything(),
        42,
        "entry-uuid",
        JSON.stringify({ memo: "Applied", muted: true }),
      );
    });
  });

  describe("alerts actions", () => {
    it("markAlertReadAction marks alert as read", async () => {
      vi.mocked(markAlertRead).mockResolvedValue(true);
      const res = await markAlertReadAction("alert-1");
      expect(res.success).toBe(true);
    });

    it("markAllAlertsReadAction marks all alerts as read", async () => {
      vi.mocked(markAllAlertsRead).mockResolvedValue(4);
      const res = await markAllAlertsReadAction();
      expect(res.success).toBe(true);
      expect(res.count).toBe(4);
    });
  });
});
