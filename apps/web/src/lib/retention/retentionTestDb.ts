import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { Queryable } from "./policy";

const MIGRATIONS = resolve(__dirname, "../../../../../db/migrations");

/**
 * Parent tables the real retention migrations reference, reduced to the
 * columns the pipeline reads. PostGIS-dependent tables are stubbed; the
 * retention tables themselves (saved_searches, watchlists, user_alerts,
 * events, notification_deliveries) come from the REAL migrations 0017/0018,
 * so the pipeline SQL runs on real Postgres semantics and real constraints.
 */
const PARENT_STUBS = `
  CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
  BEGIN NEW.updated_at = now(); RETURN NEW; END $$ LANGUAGE plpgsql;
  CREATE TYPE work_style AS ENUM ('onsite','hybrid','remote','flexible_mixed','unknown');
  CREATE TABLE users (id BIGSERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL);
  CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_name TEXT NOT NULL,
    slug TEXT NOT NULL
  );
  CREATE TABLE regions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT,
    name TEXT
  );
  CREATE TABLE data_sources (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
  CREATE TABLE role_families (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL,
    label TEXT NOT NULL
  );
  CREATE TABLE jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    source_system TEXT NOT NULL,
    title TEXT NOT NULL,
    role_family_id UUID REFERENCES role_families(id),
    remote_type work_style NOT NULL DEFAULT 'unknown',
    location_text TEXT,
    source_url TEXT NOT NULL DEFAULT 'https://example.test/job',
    posted_at TIMESTAMPTZ,
    first_seen_at TIMESTAMPTZ NOT NULL,
    expired_at TIMESTAMPTZ
  );
  CREATE TABLE evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type TEXT, entity_id TEXT, claim_type TEXT,
    claim_value JSONB, status TEXT, observed_at TIMESTAMPTZ
  );
  CREATE TABLE resolved_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    input_text TEXT, migration_category TEXT, sa4_region_id UUID
  );
  CREATE TABLE company_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID, resolved_location_id UUID,
    created_at TIMESTAMPTZ DEFAULT now()
  );
`;

export interface RetentionTestDb {
  db: PGlite;
  q: Queryable;
}

export async function createRetentionTestDb(): Promise<RetentionTestDb> {
  const db = new PGlite();
  await db.exec(PARENT_STUBS);
  for (const file of [
    "0017_saved_searches_and_watchlists.sql",
    "0018_change_events_and_notification_delivery.sql",
  ]) {
    await db.exec(readFileSync(resolve(MIGRATIONS, file), "utf8"));
  }
  const q: Queryable = {
    query: async <R>(text: string, values?: unknown[]) => {
      const result = await db.query<R>(text, values);
      return { rows: result.rows };
    },
  } as Queryable;
  return { db, q };
}

/** Seeding helpers: every row lands in the real tables. */
export async function seedUser(db: PGlite, email: string): Promise<number> {
  const r = await db.query<{ id: number }>(
    "INSERT INTO users (email) VALUES ($1) RETURNING id",
    [email],
  );
  return Number(r.rows[0]?.id);
}

export async function seedCompany(
  db: PGlite,
  slug: string,
  name = slug,
): Promise<string> {
  const r = await db.query<{ id: string }>(
    "INSERT INTO companies (display_name, slug) VALUES ($1, $2) RETURNING id",
    [name, slug],
  );
  return String(r.rows[0]?.id);
}

export async function seedRoleFamily(db: PGlite, key: string): Promise<string> {
  const r = await db.query<{ id: string }>(
    "INSERT INTO role_families (key, label) VALUES ($1, $1) RETURNING id",
    [key],
  );
  return String(r.rows[0]?.id);
}

export async function seedJob(
  db: PGlite,
  job: {
    companyId: string;
    title: string;
    firstSeenHoursAgo: number;
    postedDaysAgo?: number | null;
    source?: string;
    roleFamilyId?: string | null;
    remoteType?: string;
  },
): Promise<string> {
  const r = await db.query<{ id: string }>(
    `INSERT INTO jobs (company_id, source_system, title, role_family_id, remote_type,
                       posted_at, first_seen_at)
     VALUES ($1, $2, $3, $4, $5::work_style,
             CASE WHEN $6::numeric IS NULL THEN NULL
                  ELSE now() - ($6::numeric * interval '1 day') END,
             now() - ($7::numeric * interval '1 hour'))
     RETURNING id`,
    [
      job.companyId,
      job.source ?? "greenhouse",
      job.title,
      job.roleFamilyId ?? null,
      job.remoteType ?? "hybrid",
      job.postedDaysAgo ?? null,
      job.firstSeenHoursAgo,
    ],
  );
  return String(r.rows[0]?.id);
}

/** Inserts a job.first_seen event directly (bypassing the deriver). */
export async function seedJobEvent(
  db: PGlite,
  event: {
    companyId: string;
    companySlug: string;
    companyName?: string;
    title: string;
    hoursAgo: number;
    roleFamilyKey?: string | null;
    remoteType?: string;
    key?: string;
  },
): Promise<string> {
  const r = await db.query<{ id: string }>(
    `INSERT INTO events (event_type, entity_type, entity_id, dedupe_key, payload, occurred_at)
     VALUES ('job.first_seen', 'job', $1, $2, $3::jsonb, now() - ($4::numeric * interval '1 hour'))
     RETURNING id`,
    [
      event.key ?? event.title,
      `job:first_seen:${event.key ?? event.title}-${event.companySlug}`,
      JSON.stringify({
        companyId: event.companyId,
        companySlug: event.companySlug,
        companyName: event.companyName ?? event.companySlug,
        title: event.title,
        roleFamilyKey: event.roleFamilyKey ?? null,
        remoteType: event.remoteType ?? "hybrid",
      }),
      event.hoursAgo,
    ],
  );
  return String(r.rows[0]?.id);
}
