-- Adds Breezy HR as a supported public-board provider. The application
-- adapter and source validation were introduced in commits e30a7e3 and
-- 556f683; this forward-only migration permits the corresponding enum value
-- in company_ats_sources on deployed PostgreSQL databases.
ALTER TYPE ats_provider ADD VALUE 'breezy';
