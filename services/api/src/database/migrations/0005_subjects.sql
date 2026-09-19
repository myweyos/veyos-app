-- subjects: maps an authenticated account to its pseudonymous subject_ref, and holds the
-- profile answers the engine needs every day (SCRUM-76).
--
-- Biometric data (signal_snapshots, decisions) is keyed by subject_ref and nothing else
-- (compliance.md). The Supabase user id lives only here, so the health tables never carry an
-- identifier that the auth provider can link to an email address.
--
-- constitution_dosha is the answer from onboarding screen A7. Dosha is the constitution model
-- for now, by John's decision of 2026-09-14; plan v2 §9.2 (dosha vs baseline phenotype) is
-- still formally open, and a switch to phenotype would add columns here, not reuse this one.

CREATE TABLE IF NOT EXISTS subjects (
  subject_ref         TEXT        PRIMARY KEY CHECK (subject_ref ~ '^sub_[a-zA-Z0-9]{8,}$'),
  auth_user_id        UUID        NOT NULL UNIQUE,
  region              TEXT        NULL CHECK (region IN ('UK', 'US')),
  constitution_dosha  TEXT        NULL CHECK (constitution_dosha IN ('vata', 'pitta', 'kapha')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
