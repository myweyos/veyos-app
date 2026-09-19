-- consents: one row per decision a subject made about one purpose (design pack A4).
--
-- APPEND-ONLY. A change of mind is a new row, never an UPDATE, so the record shows what the
-- subject agreed to and when, at the version of the copy they saw. The current state of a
-- purpose is its most recent row. UK GDPR Art.9 requires explicit consent for health data,
-- and this table is the evidence that it was given, and when it was withdrawn.
--
-- Deleting the account deletes these rows with everything else (subjects.eraseSubject).

CREATE TABLE IF NOT EXISTS consents (
  id            BIGSERIAL   PRIMARY KEY,
  subject_ref   TEXT        NOT NULL REFERENCES subjects (subject_ref) ON DELETE CASCADE,
  purpose       TEXT        NOT NULL CHECK (purpose IN (
                  'health_data', 'cycle_data', 'lab_results',
                  'location_environment', 'notifications', 'product_analytics')),
  granted       BOOLEAN     NOT NULL,
  copy_version  TEXT        NOT NULL,
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS consents_subject_purpose_recorded
  ON consents (subject_ref, purpose, recorded_at DESC);
