import type { Pool } from "pg";

import type { Category } from "@austechmap/contracts";

interface CategoryRow {
  key: string;
  label: string;
  group_key: string;
  group_label: string;
}

/**
 * Every niche-level category (Appendix A.1), each paired with its parent
 * group. Only niches are returned -- company_category_links only ever
 * links to niche-level categories (see employers/category_apply.py), so a
 * group row alone would never be a usable filter value.
 */
export async function listCategories(pool: Pool): Promise<Category[]> {
  const { rows } = await pool.query<CategoryRow>(
    `SELECT child.key, child.label, parent.key AS group_key, parent.label AS group_label
     FROM categories child
     JOIN categories parent ON parent.id = child.parent_id
     ORDER BY parent.label, child.label`,
  );

  return rows.map((row) => ({
    key: row.key,
    label: row.label,
    groupKey: row.group_key,
    groupLabel: row.group_label,
  }));
}
