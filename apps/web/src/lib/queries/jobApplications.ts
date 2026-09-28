import type {
  JobApplication,
  JobApplicationStatus,
  JobVaultSnapshot,
} from "@austechmap/contracts";
import {
  JobApplicationSchema,
  JobApplicationStatusSchema,
  JobVaultSnapshotSchema,
} from "@austechmap/contracts";
import type { Pool } from "pg";

interface JobApplicationRow {
  id: string;
  user_id: string | number;
  job_id: string;
  status: string;
  snapshot: unknown;
  notes: string | null;
  saved_at: Date | string;
  status_changed_at: Date | string;
  applied_at: Date | string | null;
  interviewing_at: Date | string | null;
  offer_at: Date | string | null;
  closed_at: Date | string | null;
  updated_at: Date | string;
}

function timestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function nullableTimestamp(value: Date | string | null): string | null {
  return value === null ? null : timestamp(value);
}

function mapApplication(row: JobApplicationRow): JobApplication {
  return JobApplicationSchema.parse({
    id: row.id,
    userId: Number(row.user_id),
    jobId: row.job_id,
    status: row.status,
    snapshot: JobVaultSnapshotSchema.parse(row.snapshot),
    notes: row.notes,
    savedAt: timestamp(row.saved_at),
    statusChangedAt: timestamp(row.status_changed_at),
    appliedAt: nullableTimestamp(row.applied_at),
    interviewingAt: nullableTimestamp(row.interviewing_at),
    offerAt: nullableTimestamp(row.offer_at),
    closedAt: nullableTimestamp(row.closed_at),
    updatedAt: timestamp(row.updated_at),
  });
}

const APPLICATION_COLUMNS = `
  id, user_id, job_id, status, snapshot, notes, saved_at,
  status_changed_at, applied_at, interviewing_at, offer_at, closed_at,
  updated_at
`;

export async function listJobApplications(
  pool: Pool,
  userId: number,
): Promise<JobApplication[]> {
  const result = await pool.query<JobApplicationRow>(
    `SELECT ${APPLICATION_COLUMNS}
     FROM job_applications
     WHERE user_id = $1
     ORDER BY status_changed_at DESC, saved_at DESC`,
    [userId],
  );
  return result.rows.map(mapApplication);
}

export async function listSavedJobIds(
  pool: Pool,
  userId: number,
): Promise<Set<string>> {
  const result = await pool.query<{ job_id: string }>(
    "SELECT job_id FROM job_applications WHERE user_id = $1",
    [userId],
  );
  return new Set(result.rows.map((row) => row.job_id));
}

export async function saveJobApplication(
  pool: Pool,
  userId: number,
  jobId: string,
): Promise<JobApplication> {
  const inserted = await pool.query<JobApplicationRow>(
    `INSERT INTO job_applications (user_id, job_id, snapshot)
     SELECT
       $1,
       j.id,
       jsonb_build_object(
         'version', 1,
         'jobTitle', j.title,
         'companyName', c.display_name,
         'companySlug', c.slug,
         'roleFamily', rf.label,
         'seniority', j.seniority::text,
         'employmentType', j.employment_type,
         'workStyle', j.remote_type::text,
         'locationText', j.location_text,
         'salaryMin', j.salary_min,
         'salaryMax', j.salary_max,
         'salaryPeriod', j.salary_period,
         'graduateRole', j.graduate_role,
         'internshipRole', j.internship_role,
         'sponsorshipExplicit', j.sponsorship_explicit,
         'sourceUrl', j.source_url,
         'descriptionText', j.description_text,
         'postedAt', j.posted_at,
         'firstSeenAt', j.first_seen_at,
         'lastSeenAt', j.last_seen_at,
         'capturedAt', now(),
         'skills', COALESCE(
           (
             SELECT jsonb_agg(
               jsonb_build_object('key', s.key, 'label', s.label)
               ORDER BY s.label
             )
             FROM job_skill_links jsl
             JOIN skills s ON s.id = jsl.skill_id
             WHERE jsl.job_id = j.id
           ),
           '[]'::jsonb
         )
       )
     FROM jobs j
     JOIN companies c ON c.id = j.company_id
     LEFT JOIN role_families rf ON rf.id = j.role_family_id
     WHERE j.id = $2
       AND c.status NOT IN ('merged', 'disabled')
     ON CONFLICT (user_id, job_id) DO NOTHING
     RETURNING ${APPLICATION_COLUMNS}`,
    [userId, jobId],
  );

  if (inserted.rows[0]) return mapApplication(inserted.rows[0]);

  const existing = await pool.query<JobApplicationRow>(
    `SELECT ${APPLICATION_COLUMNS}
     FROM job_applications
     WHERE user_id = $1 AND job_id = $2`,
    [userId, jobId],
  );
  if (!existing.rows[0]) throw new Error("Job not found");
  return mapApplication(existing.rows[0]);
}

export async function updateJobApplicationStatus(
  pool: Pool,
  userId: number,
  applicationId: string,
  rawStatus: JobApplicationStatus,
): Promise<JobApplication | null> {
  const status = JobApplicationStatusSchema.parse(rawStatus);
  const result = await pool.query<JobApplicationRow>(
    `UPDATE job_applications
     SET status = $3,
         status_changed_at = now(),
         applied_at = CASE
           WHEN $3 IN ('applied', 'interviewing', 'offer', 'rejected')
             THEN COALESCE(applied_at, now())
           ELSE applied_at
         END,
         interviewing_at = CASE
           WHEN $3 IN ('interviewing', 'offer')
             THEN COALESCE(interviewing_at, now())
           ELSE interviewing_at
         END,
         offer_at = CASE
           WHEN $3 = 'offer' THEN COALESCE(offer_at, now())
           ELSE offer_at
         END,
         closed_at = CASE
           WHEN $3 IN ('rejected', 'withdrawn') THEN COALESCE(closed_at, now())
           ELSE closed_at
         END
     WHERE id = $2 AND user_id = $1
     RETURNING ${APPLICATION_COLUMNS}`,
    [userId, applicationId, status],
  );
  return result.rows[0] ? mapApplication(result.rows[0]) : null;
}

export async function updateJobApplicationNotes(
  pool: Pool,
  userId: number,
  applicationId: string,
  rawNotes: string | null,
): Promise<JobApplication | null> {
  const normalized = rawNotes?.trim() || null;
  if (normalized && normalized.length > 5000) {
    throw new Error("Notes must be 5,000 characters or fewer");
  }
  const result = await pool.query<JobApplicationRow>(
    `UPDATE job_applications
     SET notes = $3
     WHERE id = $2 AND user_id = $1
     RETURNING ${APPLICATION_COLUMNS}`,
    [userId, applicationId, normalized],
  );
  return result.rows[0] ? mapApplication(result.rows[0]) : null;
}

export async function deleteJobApplication(
  pool: Pool,
  userId: number,
  applicationId: string,
): Promise<boolean> {
  const result = await pool.query(
    "DELETE FROM job_applications WHERE id = $2 AND user_id = $1",
    [userId, applicationId],
  );
  return result.rowCount === 1;
}

export type { JobVaultSnapshot };
