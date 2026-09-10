import type { Pool } from "pg";
import type {
  AlertFrequency,
  CreateSavedSearchRequest,
  SavedSearch,
  SavedSearchFilter,
} from "@austechmap/contracts";

interface SavedSearchRow {
  id: string;
  user_id: string;
  name: string;
  filters: SavedSearchFilter;
  alert_frequency: AlertFrequency;
  last_alerted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function mapRow(row: SavedSearchRow): SavedSearch {
  return {
    id: row.id,
    userId: Number(row.user_id),
    name: row.name,
    filters: row.filters ?? {},
    alertFrequency: row.alert_frequency,
    lastAlertedAt: row.last_alerted_at
      ? row.last_alerted_at.toISOString()
      : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function listSavedSearches(
  pool: Pool,
  userId: number,
): Promise<SavedSearch[]> {
  const result = await pool.query<SavedSearchRow>(
    `SELECT id, user_id, name, filters, alert_frequency, last_alerted_at, created_at, updated_at
     FROM saved_searches
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId],
  );
  return result.rows.map(mapRow);
}

export async function createSavedSearch(
  pool: Pool,
  userId: number,
  input: CreateSavedSearchRequest,
): Promise<SavedSearch> {
  const result = await pool.query<SavedSearchRow>(
    `INSERT INTO saved_searches (user_id, name, filters, alert_frequency)
     VALUES ($1, $2, $3::jsonb, $4)
     RETURNING id, user_id, name, filters, alert_frequency, last_alerted_at, created_at, updated_at`,
    [
      userId,
      input.name,
      JSON.stringify(input.filters),
      input.alertFrequency ?? "never",
    ],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("Failed to insert saved search");
  }
  return mapRow(row);
}

export async function deleteSavedSearch(
  pool: Pool,
  userId: number,
  searchId: string,
): Promise<boolean> {
  const result = await pool.query(
    "DELETE FROM saved_searches WHERE id = $1 AND user_id = $2",
    [searchId, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function updateSavedSearchAlertFrequency(
  pool: Pool,
  userId: number,
  searchId: string,
  alertFrequency: AlertFrequency,
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE saved_searches
     SET alert_frequency = $1
     WHERE id = $2 AND user_id = $3`,
    [alertFrequency, searchId, userId],
  );
  return (result.rowCount ?? 0) > 0;
}
