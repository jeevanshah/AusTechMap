-- Applicant Velocity P1: CV/profile intake (candidate profile).
--
-- One row per user. Stores only the user-confirmed structured profile
-- (role family, experience band, skill keys, work-style preference,
-- locations) used to pre-fill Opportunity Match preferences. The source
-- resume/CV is read entirely in the user's browser and never reaches the
-- server, so there is no file/blob column of any kind, by design
-- (PRODUCT_SPEC.md §12.4.2).
--
-- Mutable, user-editable preference bag, not a point-in-time snapshot --
-- unlike job_applications (0026), there is no immutability trigger here.

CREATE TABLE candidate_profiles (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  role_family_id UUID REFERENCES role_families(id) ON DELETE SET NULL,
  experience_band TEXT NOT NULL DEFAULT 'any',
  skill_keys TEXT[] NOT NULL DEFAULT '{}',
  work_style TEXT NOT NULL DEFAULT 'any',
  work_style_required BOOLEAN NOT NULL DEFAULT false,
  locations TEXT[] NOT NULL DEFAULT '{}',
  source TEXT NOT NULL DEFAULT 'resume_upload',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (experience_band IN ('entry', 'mid', 'senior', 'lead_principal', 'any')),
  CHECK (work_style IN ('onsite', 'hybrid', 'remote', 'any')),
  CHECK (source IN ('resume_upload', 'manual')),
  CHECK (array_length(skill_keys, 1) IS NULL OR array_length(skill_keys, 1) <= 50),
  CHECK (array_length(locations, 1) IS NULL OR array_length(locations, 1) <= 20),
  -- Total-length bounds (50 keys x 64 chars + separators; 20 locations x 80
  -- chars + separators) so the table can only hold short structured values,
  -- never free text, whatever a caller sends.
  CHECK (char_length(array_to_string(skill_keys, ',')) <= 3300),
  CHECK (char_length(array_to_string(locations, ',')) <= 1700)
);

CREATE INDEX candidate_profiles_role_family_idx
  ON candidate_profiles (role_family_id) WHERE role_family_id IS NOT NULL;

CREATE TRIGGER candidate_profiles_set_updated_at
BEFORE UPDATE ON candidate_profiles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
