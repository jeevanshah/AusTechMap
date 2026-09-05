import type { MetadataRoute } from "next";

import { getPool } from "../lib/db";

export const dynamic = "force-dynamic";

interface CompanySlugRow {
  slug: string;
  updated_at: string;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const { rows } = await getPool().query<CompanySlugRow>(
    `SELECT slug, updated_at FROM companies WHERE status NOT IN ('merged', 'disabled')`,
  );

  return rows.map((row) => ({
    url: `${baseUrl}/companies/${row.slug}`,
    lastModified: new Date(row.updated_at),
    changeFrequency: "weekly",
    priority: 0.6,
  }));
}
