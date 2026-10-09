import type { Pool } from "pg";

export interface RoleFamilyRow {
  id: string;
  key: string;
  label: string;
}

export interface SkillRow {
  id: string;
  key: string;
  label: string;
  category: string;
  aliases: string[];
}

export async function listRoleFamilies(pool: Pool): Promise<RoleFamilyRow[]> {
  const result = await pool.query<RoleFamilyRow>(
    "SELECT id, key, label FROM role_families ORDER BY label",
  );
  return result.rows;
}

export async function listActiveSkills(pool: Pool): Promise<SkillRow[]> {
  const result = await pool.query<SkillRow>(
    `SELECT id, key, label, category, aliases
     FROM skills
     WHERE active
     ORDER BY label`,
  );
  return result.rows;
}
