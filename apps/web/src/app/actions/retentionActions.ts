"use server";

import { revalidatePath } from "next/cache";
import type {
  AlertFrequency,
  SavedSearch,
  SavedSearchFilter,
} from "@austechmap/contracts";

import { requireUser } from "../../lib/auth/require-role";
import { getPool } from "../../lib/db";
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

export async function saveSearchAction(
  name: string,
  filters: SavedSearchFilter,
  alertFrequency: AlertFrequency = "never",
): Promise<{ success: boolean; search?: SavedSearch; error?: string }> {
  try {
    const actor = await requireUser();
    const pool = getPool();
    const search = await createSavedSearch(pool, actor.id, {
      name,
      filters,
      alertFrequency,
    });
    revalidatePath("/account");
    return { success: true, search };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save search",
    };
  }
}

export async function deleteSavedSearchAction(
  searchId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const actor = await requireUser();
    const pool = getPool();
    const ok = await deleteSavedSearch(pool, actor.id, searchId);
    revalidatePath("/account");
    return { success: ok };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to delete saved search",
    };
  }
}

export async function updateSavedSearchFrequencyAction(
  searchId: string,
  frequency: AlertFrequency,
): Promise<{ success: boolean; error?: string }> {
  try {
    const actor = await requireUser();
    const pool = getPool();
    const ok = await updateSavedSearchAlertFrequency(
      pool,
      actor.id,
      searchId,
      frequency,
    );
    revalidatePath("/account");
    return { success: ok };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to update alert frequency",
    };
  }
}

export async function toggleCompanyWatchAction(
  companyId: string,
): Promise<{ success: boolean; watching?: boolean; error?: string }> {
  try {
    const actor = await requireUser();
    const pool = getPool();
    const result = await toggleCompanyWatch(pool, actor.id, companyId);
    revalidatePath("/account");
    return { success: true, watching: result.watching };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to toggle watchlist",
    };
  }
}

export async function toggleRegionWatchAction(
  sa4Code: string,
  regionId?: string,
): Promise<{ success: boolean; watching?: boolean; error?: string }> {
  try {
    const actor = await requireUser();
    const pool = getPool();
    const result = await toggleRegionWatch(pool, actor.id, sa4Code, regionId);
    revalidatePath("/account");
    return { success: true, watching: result.watching };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to toggle region watch",
    };
  }
}

export async function removeWatchlistEntryAction(
  entryId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const actor = await requireUser();
    const pool = getPool();
    const ok = await removeWatchlistEntry(pool, actor.id, entryId);
    revalidatePath("/account");
    return { success: ok };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to remove watchlist entry",
    };
  }
}

export async function markAlertReadAction(
  alertId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const actor = await requireUser();
    const pool = getPool();
    const ok = await markAlertRead(pool, actor.id, alertId);
    revalidatePath("/account");
    return { success: ok };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to mark alert as read",
    };
  }
}

export async function markAllAlertsReadAction(): Promise<{
  success: boolean;
  count?: number;
  error?: string;
}> {
  try {
    const actor = await requireUser();
    const pool = getPool();
    const count = await markAllAlertsRead(pool, actor.id);
    revalidatePath("/account");
    return { success: true, count };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to mark alerts as read",
    };
  }
}

export async function pauseAllSavedSearchesAction(): Promise<{
  success: boolean;
  count?: number;
  error?: string;
}> {
  try {
    const actor = await requireUser();
    const pool = getPool();
    const count = await pauseAllSavedSearches(pool, actor.id);
    revalidatePath("/account");
    return { success: true, count };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to pause all saved searches",
    };
  }
}

export async function resumeAllSavedSearchesAction(
  frequency: AlertFrequency = "weekly",
): Promise<{
  success: boolean;
  count?: number;
  error?: string;
}> {
  try {
    const actor = await requireUser();
    const pool = getPool();
    const count = await resumeAllSavedSearches(pool, actor.id, frequency);
    revalidatePath("/account");
    return { success: true, count };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to resume saved searches",
    };
  }
}

export async function updateWatchlistNotesAction(
  entryId: string,
  rawNotes: string | null,
): Promise<{ success: boolean; error?: string }> {
  try {
    const actor = await requireUser();
    const pool = getPool();
    const ok = await updateWatchlistNotes(pool, actor.id, entryId, rawNotes);
    revalidatePath("/account");
    return { success: ok };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to update watchlist notes",
    };
  }
}

export async function toggleWatchlistMuteAction(
  entryId: string,
  currentNotes: string | null,
  muted: boolean,
): Promise<{ success: boolean; error?: string }> {
  try {
    const actor = await requireUser();
    const pool = getPool();
    let meta: { muted?: boolean; memo?: string } = {};
    if (currentNotes) {
      try {
        meta = JSON.parse(currentNotes);
      } catch {
        meta = { memo: currentNotes };
      }
    }
    meta.muted = muted;
    const serialized = JSON.stringify(meta);
    const ok = await updateWatchlistNotes(pool, actor.id, entryId, serialized);
    revalidatePath("/account");
    return { success: ok };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to update watchlist alert preferences",
    };
  }
}
