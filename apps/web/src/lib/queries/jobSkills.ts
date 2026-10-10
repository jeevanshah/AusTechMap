import type { Pool } from "pg";

import type { JobSkillInput } from "../jobs/skillFit";

interface JobSkillRow {
  job_id: string;
  key: string;
  label: string;
  confidence: string | number;
}

/**
 * Skills the ingestion worker extracted for each job (title/description
 * keyword matches), for the given job ids. Only active taxonomy skills are
 * returned; a job with no extracted skills is simply absent from the map.
 */
export async function listJobSkills(
  pool: Pool,
  jobIds: string[],
): Promise<Map<string, JobSkillInput[]>> {
  const bySkill = new Map<string, JobSkillInput[]>();
  if (jobIds.length === 0) return bySkill;

  const result = await pool.query<JobSkillRow>(
    `SELECT l.job_id, s.key, s.label, l.confidence
     FROM job_skill_links l
     JOIN skills s ON s.id = l.skill_id AND s.active
     WHERE l.job_id = ANY($1::uuid[])
     ORDER BY l.job_id, l.confidence DESC, s.label`,
    [jobIds],
  );

  for (const row of result.rows) {
    const list = bySkill.get(row.job_id) ?? [];
    list.push({
      key: row.key,
      label: row.label,
      confidence: Number(row.confidence), // NUMERIC arrives as a string
    });
    bySkill.set(row.job_id, list);
  }
  return bySkill;
}
