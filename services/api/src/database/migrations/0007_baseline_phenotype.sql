-- Baseline phenotype (SCRUM-89/90/95): the Module J answers, and the identity questions.
--
-- ANSWERS ARE THE DURABLE ARTEFACT. Trait scores are derived from them by the instrument
-- version recorded on the row, and are recomputed on read. Storing scores would freeze them to
-- the model that happened to be live; storing answers means a re-weighted instrument can
-- re-score history. Scores never reach a client (SCRUM-91).
--
-- One row per submission, append-only. The latest row is the current baseline. A "that doesn't
-- sound like me" correction is a new submission with the re-asked item changed, and
-- corrected_fragment says which sentence prompted it: the cheapest validation data the product
-- will ever get.

CREATE TABLE IF NOT EXISTS baseline_submissions (
  id                  BIGSERIAL   PRIMARY KEY,
  subject_ref         TEXT        NOT NULL REFERENCES subjects (subject_ref) ON DELETE CASCADE,
  instrument          TEXT        NOT NULL,
  instrument_version  TEXT        NOT NULL,
  answers             JSONB       NOT NULL,
  -- J5b: the hour the subject's energy reliably drops, or NULL for "no consistent dip".
  energy_dip_at       TIME        NULL,
  corrected_fragment  TEXT        NULL,
  submitted_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS baseline_submissions_subject_submitted
  ON baseline_submissions (subject_ref, submitted_at DESC);

-- Module A identity questions (SCRUM-95). Every column names its downstream use.
-- Nothing the wearable can answer is asked: no steps, no resting HR, no sleep duration.
ALTER TABLE subjects
  ADD COLUMN IF NOT EXISTS date_of_birth   DATE     NULL,   -- age-banding for targets
  ADD COLUMN IF NOT EXISTS height_cm       SMALLINT NULL CHECK (height_cm BETWEEN 100 AND 250),   -- load targets
  ADD COLUMN IF NOT EXISTS weight_kg       NUMERIC(5,1) NULL CHECK (weight_kg BETWEEN 30 AND 300),   -- load targets
  ADD COLUMN IF NOT EXISTS waist_cm        NUMERIC(5,1) NULL CHECK (waist_cm BETWEEN 40 AND 200),    -- primary outcome metric; re-asked monthly (SCRUM-99)
  ADD COLUMN IF NOT EXISTS usual_wake_time TIME     NULL,   -- start of the contact window
  ADD COLUMN IF NOT EXISTS usual_sleep_time TIME    NULL,   -- end of the contact window
  ADD COLUMN IF NOT EXISTS fixed_start     TEXT     NULL CHECK (fixed_start IN ('no', 'some', 'yes')),   -- whether the wake time is imposed
  ADD COLUMN IF NOT EXISTS work_pattern    TEXT     NULL CHECK (work_pattern IN ('fixed', 'flexible', 'shift', 'self-directed'));   -- scheduling

-- Waist history for the H1 chart (SCRUM-99): every measurement kept, no verdict attached.
CREATE TABLE IF NOT EXISTS waist_measurements (
  id           BIGSERIAL    PRIMARY KEY,
  subject_ref  TEXT         NOT NULL REFERENCES subjects (subject_ref) ON DELETE CASCADE,
  waist_cm     NUMERIC(5,1) NOT NULL CHECK (waist_cm BETWEEN 40 AND 200),
  measured_on  DATE         NOT NULL,
  recorded_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS waist_measurements_subject_measured
  ON waist_measurements (subject_ref, measured_on DESC);
