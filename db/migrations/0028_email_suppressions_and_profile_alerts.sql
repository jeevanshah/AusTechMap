-- P3 (Applicant Velocity): safe, opt-out-able email alerts and opt-in profile alerts.
--
-- email_suppressions: one row per user who must not receive alert email
-- (PRODUCT_SPEC Appendix D.3: unsubscribe is applied before enqueueing). Written by
-- the signed one-click unsubscribe route; removed when the user turns email alerts
-- back on. Deleted with the user (ON DELETE CASCADE), so erasure needs no extra hook.
--
-- candidate_profiles.alert_frequency: opt-in alerts for new roles matching the
-- user's confirmed candidate profile (a new use of that profile, disclosed on the
-- privacy page). Defaults to 'never': nobody is opted in by this migration.

CREATE TABLE email_suppressions (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (reason IN ('unsubscribed', 'bounced', 'complaint'))
);

ALTER TABLE candidate_profiles
  ADD COLUMN alert_frequency TEXT NOT NULL DEFAULT 'never',
  ADD CONSTRAINT candidate_profiles_alert_frequency_check
    CHECK (alert_frequency IN ('never', 'daily', 'instant'));
