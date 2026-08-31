BEGIN;

CREATE TABLE ingress_events (
  receipt_id text PRIMARY KEY CHECK (receipt_id ~ '^rcpt_[A-Za-z0-9_-]{1,128}$'),
  schema_version text NOT NULL,
  event_type text NOT NULL,
  envelope_id text NOT NULL,
  request_id text NOT NULL,
  correlation_id text NOT NULL,
  idempotency_key char(64) NOT NULL UNIQUE CHECK (idempotency_key ~ '^[a-f0-9]{64}$'),
  raw_body_hash char(64) NOT NULL CHECK (raw_body_hash ~ '^[a-f0-9]{64}$'),
  payload_hash char(64) CHECK (payload_hash IS NULL OR payload_hash ~ '^[a-f0-9]{64}$'),
  actor_chat_user_name text NOT NULL,
  registry_subject_id text NOT NULL,
  source_space_name text NOT NULL,
  source_thread_name text,
  source_message_name text,
  source_space_type text NOT NULL CHECK (
    source_space_type IN ('DIRECT_MESSAGE', 'SPACE', 'GROUP_CHAT')
  ),
  source_channel text NOT NULL CHECK (source_channel IN ('dm', 'shared')),
  purpose text NOT NULL,
  canonical_envelope jsonb NOT NULL,
  adapter_name text NOT NULL,
  adapter_version text NOT NULL,
  policy_version text NOT NULL,
  policy_evaluation_id text NOT NULL,
  event_created_at timestamptz NOT NULL,
  event_expires_at timestamptz NOT NULL,
  first_received_at timestamptz NOT NULL,
  CHECK (event_expires_at > event_created_at)
);

CREATE TABLE outbox_events (
  outbox_id uuid PRIMARY KEY,
  receipt_id text NOT NULL UNIQUE REFERENCES ingress_events(receipt_id),
  topic text NOT NULL CHECK (length(topic) BETWEEN 1 AND 128),
  delivery_envelope jsonb NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (
    state IN ('pending', 'claimed', 'published', 'quarantined')
  ),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at timestamptz NOT NULL,
  lease_owner text,
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL,
  published_at timestamptz,
  last_error_code text
);

CREATE INDEX outbox_dispatch_idx
  ON outbox_events (state, available_at, created_at);

CREATE FUNCTION block_ingress_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ingress_events is append-only';
END;
$$;

CREATE TRIGGER ingress_append_only
  BEFORE UPDATE OR DELETE ON ingress_events
  FOR EACH ROW EXECUTE FUNCTION block_ingress_mutation();

CREATE FUNCTION block_outbox_payload_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.receipt_id IS DISTINCT FROM OLD.receipt_id
     OR NEW.topic IS DISTINCT FROM OLD.topic
     OR NEW.delivery_envelope IS DISTINCT FROM OLD.delivery_envelope THEN
    RAISE EXCEPTION 'outbox event payload is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER outbox_payload_immutable
  BEFORE UPDATE ON outbox_events
  FOR EACH ROW EXECUTE FUNCTION block_outbox_payload_mutation();

REVOKE UPDATE, DELETE, TRUNCATE ON ingress_events FROM PUBLIC;
REVOKE DELETE, TRUNCATE ON outbox_events FROM PUBLIC;

COMMIT;
