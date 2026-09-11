-- signal_snapshots: one row per (subject_ref, as_of).
--
-- Flat columns mirror the canonical signal-snapshot.schema.json fields so queries can filter
-- and aggregate on individual signals without parsing JSON. snapshot_json stores the full
-- original payload for round-trip retrieval without marshalling.
--
-- TimescaleDB partitions on as_of (DATE, monthly chunks). The PRIMARY KEY (subject_ref, as_of)
-- satisfies the TimescaleDB constraint that the partition column must appear in every UNIQUE
-- index. One snapshot per subject per calendar day; an upsert on conflict overwrites — see
-- ADR 0007 for the open question on same-day multi-source snapshots.
--
-- No region column: region is an account attribute, not a signal field. See ADR 0007.
-- TODO(SCRUM-77): per-region connection routing replaces the single database URL.

CREATE TABLE IF NOT EXISTS signal_snapshots (
  -- identity
  subject_ref              TEXT        NOT NULL,
  as_of                    DATE        NOT NULL,
  schema_version           SMALLINT    NOT NULL DEFAULT 1,
  timezone                 TEXT,

  -- biometrics (all nullable — cold start and partial-permission states are normal)
  hrv_ms                   DOUBLE PRECISION,
  rhr_bpm                  DOUBLE PRECISION,
  sleep_deep_rem_pct       DOUBLE PRECISION,
  sleep_score              DOUBLE PRECISION,  -- display only; rules must not read this
  wrist_temp_delta_c       DOUBLE PRECISION,
  steps                    BIGINT,
  biometrics_source        TEXT,
  captured_at              TIMESTAMPTZ,

  -- baselines (trailing window computed on device)
  baseline_hrv_ms          DOUBLE PRECISION,
  baseline_hrv_sd          DOUBLE PRECISION,
  baseline_rhr_bpm         DOUBLE PRECISION,
  baseline_rhr_sd          DOUBLE PRECISION,
  baseline_sleep_deep_rem_pct DOUBLE PRECISION,
  baseline_days_of_history INTEGER,
  baseline_window_days     INTEGER,

  -- cycle (nullable per schema: cycle may be null, not just absent)
  cycle_day                INTEGER,
  cycle_length             INTEGER,
  cycle_tracked            BOOLEAN,

  -- constitution (required)
  dosha                    TEXT        NOT NULL,

  -- environment
  ambient_temp_c           DOUBLE PRECISION,
  moon_phase               TEXT,
  season                   TEXT,
  wind_kph                 DOUBLE PRECISION,
  pollen_index             DOUBLE PRECISION,  -- candidate rule 4.4, not consumed by any enabled rule
  aqi                      DOUBLE PRECISION,  -- candidate rule 4.4, not consumed by any enabled rule

  -- labs — Layer 5 fires only when present AND flagged abnormal
  lab_pm_cortisol_status        TEXT,
  lab_pm_cortisol_value         DOUBLE PRECISION,
  lab_pm_cortisol_unit          TEXT,
  lab_pm_cortisol_collected_on  DATE,

  lab_hs_crp_status             TEXT,
  lab_hs_crp_value              DOUBLE PRECISION,
  lab_hs_crp_unit               TEXT,
  lab_hs_crp_collected_on       DATE,

  lab_hba1c_status              TEXT,
  lab_hba1c_value               DOUBLE PRECISION,
  lab_hba1c_unit                TEXT,
  lab_hba1c_collected_on        DATE,

  lab_fasting_glucose_status        TEXT,
  lab_fasting_glucose_value         DOUBLE PRECISION,
  lab_fasting_glucose_unit          TEXT,
  lab_fasting_glucose_collected_on  DATE,

  -- planned activity
  activity_type            TEXT,
  activity_intensity       TEXT,
  activity_location        TEXT,
  activity_planned_at      TIMESTAMPTZ,

  -- planned meals stored as JSONB — complex nested array, no query need for individual items
  planned_meals            JSONB,

  -- original payload for lossless retrieval
  snapshot_json            JSONB       NOT NULL,

  -- metadata
  ingested_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (subject_ref, as_of)
);

SELECT create_hypertable(
  'signal_snapshots',
  'as_of',
  chunk_time_interval => INTERVAL '1 month',
  if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS signal_snapshots_subject_as_of
  ON signal_snapshots (subject_ref, as_of DESC);
