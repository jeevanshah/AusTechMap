-- Phase 7: Longitudinal change-event derivation and notification delivery ledger.
-- Implements PRODUCT_SPEC.md Appendix D.2 (Event Contract) and D.3 (Notification Invariants).
-- Replay-safe dedupe_key prevents repeated creation of the same change event.
-- Unique constraint (user_id, event_id, channel, delivery_window) guarantees no duplicate delivery.

CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_id UUID REFERENCES data_sources(id) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  event_version SMALLINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (btrim(event_type) <> ''),
  CHECK (btrim(entity_type) <> ''),
  CHECK (btrim(entity_id) <> ''),
  CHECK (btrim(dedupe_key) <> ''),
  CHECK (jsonb_typeof(payload) = 'object'),
  CHECK (event_version >= 1)
);

CREATE INDEX events_occurred_at_idx ON events (occurred_at DESC);
CREATE INDEX events_entity_idx ON events (entity_type, entity_id);
CREATE INDEX events_type_idx ON events (event_type);

CREATE TABLE notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  delivery_window TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  error_message TEXT,
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (channel IN ('in_app', 'email')),
  CHECK (status IN ('sent', 'skipped_suppressed', 'failed')),
  CHECK (btrim(delivery_window) <> ''),
  UNIQUE (user_id, event_id, channel, delivery_window)
);

CREATE INDEX notification_deliveries_user_idx ON notification_deliveries (user_id, delivered_at DESC);
CREATE INDEX notification_deliveries_event_idx ON notification_deliveries (event_id);
