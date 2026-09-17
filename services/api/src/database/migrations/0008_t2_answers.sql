-- T2 answers (Modules D and E, SCRUM-97/98). One row per answer; the latest row per item is
-- current. Append-only, like baseline_submissions: a changed answer is a new row, so the
-- history of what the subject said, and when, is kept. Partial completion is a normal state:
-- the surface is skippable and resumable, so any subset of items may be answered.

CREATE TABLE IF NOT EXISTS t2_answers (
  id                  BIGSERIAL   PRIMARY KEY,
  subject_ref         TEXT        NOT NULL REFERENCES subjects (subject_ref) ON DELETE CASCADE,
  instrument          TEXT        NOT NULL,
  instrument_version  TEXT        NOT NULL,
  item_id             TEXT        NOT NULL,
  answer              JSONB       NOT NULL,
  answered_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS t2_answers_subject_item_answered
  ON t2_answers (subject_ref, item_id, answered_at DESC);
