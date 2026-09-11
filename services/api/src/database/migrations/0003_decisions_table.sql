-- decisions: one row per engine decision. Stores the full DecisionEnvelope as JSONB.
--
-- decision_id is the first 16 hex characters of sha256 over the canonical JSON of `decision`,
-- computed once in Python (ADR 0006). It is opaque here — never re-derived in TypeScript.
-- Lookups are by index on decision_id; the table is partitioned on created_at so
-- TimescaleDB's add_retention_policy applies uniformly alongside signal_snapshots.
--
-- Deviation from spec: the spec says PRIMARY KEY (decision_id TEXT). A hypertable requires
-- the partition column in every UNIQUE constraint or index. Since decision_id is opaque and
-- not time-based, a UNIQUE INDEX on decision_id alone is rejected by TimescaleDB. A regular
-- (non-unique) index is used instead. Idempotency is enforced at the application layer.
-- See ADR 0007 for full rationale.
--
-- Idempotency: application-layer only. DecisionRepository.save() checks for an existing row
-- by decision_id before inserting; content-addressed ids make the same decision a safe no-op.

CREATE TABLE IF NOT EXISTS decisions (
  decision_id  TEXT        NOT NULL,
  subject_ref  TEXT        NOT NULL,
  as_of        DATE        NOT NULL,
  envelope     JSONB       NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

SELECT create_hypertable(
  'decisions',
  'created_at',
  chunk_time_interval => INTERVAL '1 month',
  if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS decisions_decision_id
  ON decisions (decision_id);

CREATE INDEX IF NOT EXISTS decisions_subject_ref_created_at
  ON decisions (subject_ref, created_at DESC);
