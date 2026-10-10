import type {
  CandidateProfile,
  ProfileAlertFrequency,
  SaveCandidateProfileInput,
} from "@austechmap/contracts";
import { CandidateProfileSchema } from "@austechmap/contracts";
import type { Pool } from "pg";

interface CandidateProfileRow {
  user_id: string | number;
  role_family_key: string | null;
  role_family_label: string | null;
  experience_band: string;
  skills: Array<{ key: string; label: string }>;
  work_style: string;
  work_style_required: boolean;
  locations: string[];
  source: string;
  alert_frequency: string;
  created_at: Date | string;
  updated_at: Date | string;
}

function timestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function mapProfile(row: CandidateProfileRow): CandidateProfile {
  return CandidateProfileSchema.parse({
    userId: Number(row.user_id),
    roleFamilyKey: row.role_family_key,
    roleFamilyLabel: row.role_family_label,
    experienceBand: row.experience_band,
    skills: row.skills,
    workStyle: row.work_style,
    workStyleRequired: row.work_style_required,
    locations: row.locations,
    source: row.source,
    alertFrequency: row.alert_frequency,
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  });
}

// Joins role_families/skills at read time so the profile always reflects
// current taxonomy labels, even if a label is renamed after the profile
// was saved (only the stable `key`s are persisted on candidate_profiles).
// Skills are built key-by-key (unnest ... WITH ORDINALITY + LEFT JOIN) so a
// stored key that has since disappeared from the taxonomy falls back to
// its own key as the label instead of shifting every later label by one.
const PROFILE_SELECT = `
  SELECT
    cp.user_id,
    rf.key AS role_family_key,
    rf.label AS role_family_label,
    cp.experience_band,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object('key', k.key, 'label', COALESCE(s.label, k.key))
          ORDER BY k.ord
        )
        FROM unnest(cp.skill_keys) WITH ORDINALITY AS k(key, ord)
        LEFT JOIN skills s ON s.key = k.key
      ),
      '[]'::jsonb
    ) AS skills,
    cp.work_style,
    cp.work_style_required,
    cp.locations,
    cp.source,
    cp.alert_frequency,
    cp.created_at,
    cp.updated_at
  FROM candidate_profiles cp
  LEFT JOIN role_families rf ON rf.id = cp.role_family_id
`;

export async function getCandidateProfile(
  pool: Pool,
  userId: number,
): Promise<CandidateProfile | null> {
  const result = await pool.query<CandidateProfileRow>(
    `${PROFILE_SELECT} WHERE cp.user_id = $1`,
    [userId],
  );
  return result.rows[0] ? mapProfile(result.rows[0]) : null;
}

export async function upsertCandidateProfile(
  pool: Pool,
  userId: number,
  input: SaveCandidateProfileInput,
): Promise<CandidateProfile> {
  const upserted = await pool.query(
    `INSERT INTO candidate_profiles (
       user_id, role_family_id, experience_band, skill_keys,
       work_style, work_style_required, locations, source
     )
     VALUES (
       $1,
       (SELECT id FROM role_families WHERE key = $2),
       $3, $4, $5, $6, $7, $8
     )
     ON CONFLICT (user_id) DO UPDATE SET
       role_family_id = EXCLUDED.role_family_id,
       experience_band = EXCLUDED.experience_band,
       skill_keys = EXCLUDED.skill_keys,
       work_style = EXCLUDED.work_style,
       work_style_required = EXCLUDED.work_style_required,
       locations = EXCLUDED.locations,
       source = EXCLUDED.source
     RETURNING user_id`,
    [
      userId,
      input.roleFamilyKey,
      input.experienceBand,
      input.skillKeys,
      input.workStyle,
      input.workStyleRequired,
      input.locations,
      input.source,
    ],
  );

  if (!upserted.rows[0]) throw new Error("Failed to save candidate profile");
  const profile = await getCandidateProfile(pool, userId);
  if (!profile) throw new Error("Failed to load saved candidate profile");
  return profile;
}

export async function deleteCandidateProfile(
  pool: Pool,
  userId: number,
): Promise<boolean> {
  const result = await pool.query(
    "DELETE FROM candidate_profiles WHERE user_id = $1",
    [userId],
  );
  return (result.rowCount ?? 0) === 1;
}

/** Returns false when the user has no saved profile (nothing to alert on). */
export async function setProfileAlertFrequency(
  pool: Pool,
  userId: number,
  frequency: ProfileAlertFrequency,
): Promise<boolean> {
  const result = await pool.query(
    "UPDATE candidate_profiles SET alert_frequency = $2 WHERE user_id = $1",
    [userId, frequency],
  );
  return (result.rowCount ?? 0) === 1;
}
