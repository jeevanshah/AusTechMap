-- Preserve locks across rate-limit window boundaries and serialize concurrent
-- requests for the same scope/key. Migration 0012's table and primary key stay
-- intact so the migration can be deployed before the application update.
CREATE FUNCTION check_auth_rate_limit(
  p_scope TEXT,
  p_key TEXT,
  p_now TIMESTAMPTZ,
  p_window_seconds INTEGER,
  p_limit INTEGER,
  p_lock_seconds INTEGER
)
RETURNS TABLE (attempt_count INTEGER, locked_until TIMESTAMPTZ)
LANGUAGE plpgsql
AS $$
DECLARE
  current_bucket auth_rate_limit_buckets%ROWTYPE;
  next_attempt_count INTEGER;
  next_locked_until TIMESTAMPTZ;
  window_interval INTERVAL;
BEGIN
  IF btrim(p_scope) = '' OR btrim(p_key) = '' THEN
    RAISE EXCEPTION 'rate-limit scope and key must not be blank'
      USING ERRCODE = '22023';
  END IF;
  IF p_window_seconds <= 0 OR p_limit <= 0 OR p_lock_seconds <= 0 THEN
    RAISE EXCEPTION 'rate-limit window, limit, and lock duration must be positive'
      USING ERRCODE = '22023';
  END IF;

  window_interval := make_interval(secs => p_window_seconds);

  -- A hash collision can only serialize unrelated keys; it cannot let a
  -- request bypass a limit. The lock lasts for this transaction/statement.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_scope || chr(31) || p_key, 0)
  );

  -- An active lock wins even if the legacy fixed-window implementation has
  -- already created a newer, unlocked bucket across a wall-clock boundary.
  SELECT bucket.*
  INTO current_bucket
  FROM auth_rate_limit_buckets AS bucket
  WHERE bucket.scope = p_scope AND bucket.key = p_key
  ORDER BY
    (bucket.locked_until > p_now) DESC,
    CASE
      WHEN bucket.locked_until > p_now THEN bucket.locked_until
      ELSE NULL
    END DESC NULLS LAST,
    bucket.window_start DESC
  FOR UPDATE
  LIMIT 1;

  IF FOUND AND current_bucket.locked_until > p_now THEN
    RETURN QUERY
    SELECT current_bucket.attempt_count, current_bucket.locked_until;
    RETURN;
  END IF;

  IF FOUND
     AND current_bucket.locked_until IS NULL
     AND current_bucket.window_start + window_interval > p_now THEN
    UPDATE auth_rate_limit_buckets AS bucket
    SET attempt_count = bucket.attempt_count + 1,
        locked_until = CASE
          WHEN bucket.attempt_count + 1 > p_limit
            THEN p_now + make_interval(secs => p_lock_seconds)
          ELSE NULL
        END
    WHERE bucket.scope = current_bucket.scope
      AND bucket.key = current_bucket.key
      AND bucket.window_start = current_bucket.window_start
    RETURNING bucket.attempt_count, bucket.locked_until
    INTO next_attempt_count, next_locked_until;
  ELSE
    INSERT INTO auth_rate_limit_buckets (
      scope,
      key,
      window_start,
      attempt_count,
      locked_until
    )
    VALUES (p_scope, p_key, p_now, 1, NULL)
    RETURNING auth_rate_limit_buckets.attempt_count,
              auth_rate_limit_buckets.locked_until
    INTO next_attempt_count, next_locked_until;
  END IF;

  RETURN QUERY SELECT next_attempt_count, next_locked_until;
END;
$$;
