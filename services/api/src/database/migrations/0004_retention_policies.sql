-- Retention: 730 days (2 years) on both hypertables.
--
-- Binding constraint: UK GDPR Art.5(1)(e) + Art.9. signal_snapshots is Art.9 special-category
-- health data; the documented purpose is "personalised daily guidance using trend baselines".
-- Two years provides ~8 baseline windows (the schema's baseline_window_days is at most 90),
-- capturing two full seasonal cycles — sufficient for stable individual baselines.
-- Three years has no additional justified purpose at MVP.
--
-- Confirming constraint: CCPA/CPRA (California) and FTC Act Section 5 require retention "no
-- longer than reasonably necessary for the disclosed purpose". Neither imposes a shorter period
-- for this data category, so the UK constraint is binding.
--
-- Review date: 2 years from production launch.
-- TODO: revisit with counsel sign-off before any real user data enters the store.
-- TODO(SCRUM-77): per-region retention may diverge once separate regional instances exist.

SELECT add_retention_policy(
  'signal_snapshots',
  INTERVAL '730 days',
  if_not_exists => TRUE
);

SELECT add_retention_policy(
  'decisions',
  INTERVAL '730 days',
  if_not_exists => TRUE
);
