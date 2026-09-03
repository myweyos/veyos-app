/**
 * Weyos shared contract — TypeScript view.
 *
 * The JSON Schema files in ../schemas are the SOURCE OF TRUTH. These types are the
 * TypeScript projection of them and must be regenerated, not hand-edited, when the
 * schema changes:
 *
 *   npm run generate   # json-schema-to-typescript ../schemas/*.json -> ./src/generated.ts
 *
 * The hand-written types below exist so the repo compiles before the generator is wired.
 * Delete them the moment generation is in place (tracked: VEY-SCHEMA-GEN).
 */

export const SCHEMA_VERSION = 1 as const;

export type Dosha = "vata" | "pitta" | "kapha";
export type Intensity = "rest" | "low" | "moderate" | "high" | "max";
export type Location = "indoor" | "outdoor" | "outdoor_midday";
export type LabStatus = "normal" | "high" | "low" | "unknown";
export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";
export type SignalSource = "healthkit" | "health_connect" | "ble" | "manual" | "simulated";

export interface LabValue {
  value?: number | null;
  unit?: string | null;
  status: LabStatus;
  collected_on?: string | null;
}

export interface FoodItem {
  name: string;
  /** Must come from schemas/food-tags.json. */
  tags: string[];
}

export interface PlannedMeal {
  slot: MealSlot;
  items: FoodItem[];
}

export interface SignalSnapshot {
  schema_version: typeof SCHEMA_VERSION;
  /** Pseudonymous. Never a name, email or device id. */
  subject_ref: string;
  as_of: string;
  timezone?: string;
  biometrics?: {
    hrv_ms?: number | null;
    rhr_bpm?: number | null;
    sleep_deep_rem_pct?: number | null;
    /** Display only. Rules must not read this. */
    sleep_score?: number | null;
    wrist_temp_delta_c?: number | null;
    steps?: number | null;
    source?: SignalSource;
    captured_at?: string;
  };
  baselines?: {
    hrv_ms?: number | null;
    hrv_sd?: number | null;
    rhr_bpm?: number | null;
    rhr_sd?: number | null;
    sleep_deep_rem_pct?: number | null;
    days_of_history?: number;
    window_days?: number;
  };
  cycle?: {
    cycle_day?: number | null;
    cycle_length?: number | null;
    tracked?: boolean;
  } | null;
  constitution: { dosha: Dosha };
  environment?: {
    ambient_temp_c?: number | null;
    moon_phase?: "new" | "waxing" | "full" | "waning" | null;
    season?: "spring" | "summer" | "autumn" | "winter" | null;
    wind_kph?: number | null;
    /** Carried but not consumed by any enabled rule. Candidate rule 4.4. */
    pollen_index?: number | null;
    aqi?: number | null;
  };
  labs?: {
    pm_cortisol?: LabValue | null;
    hs_crp?: LabValue | null;
    hba1c?: LabValue | null;
    fasting_glucose?: LabValue | null;
  };
  planned_activity?: {
    type?: string;
    intensity?: Intensity;
    location?: Location;
    planned_at?: string;
  } | null;
  planned_meals?: PlannedMeal[];
}

export type DecisionState = "calm" | "intervention" | "insufficient_baseline";
export type ActivityVerdict = "allow" | "downgrade" | "substitute" | "relocate" | "rest";

export interface FiredRule {
  rule_id: string;
  name?: string;
  layer: 1 | 2 | 3 | 4 | 5;
  priority: number;
  /** Deltas and thresholds only — never a raw value tied to a subject. */
  because?: string[];
}

export interface TraceEntry {
  step: "evaluate" | "activity" | "food" | "supplements" | "constraints";
  rule_id: string;
  detail: string;
}

export interface Decision {
  schema_version: typeof SCHEMA_VERSION;
  subject_ref: string;
  as_of: string;
  rulebook_version: number;
  elemental_layer_enabled?: boolean;
  state: DecisionState;
  fired_rules: FiredRule[];
  activity: {
    verdict: ActivityVerdict;
    planned?: string | null;
    prescribed?: string | null;
    location?: string | null;
    decided_by?: string | null;
  };
  food: {
    meals: Array<{
      slot: string;
      items: FoodItem[];
      removed: Array<{ name: string; rule_id: string; reason: string }>;
    }>;
    mandated_tags?: string[];
    blocked_tags?: string[];
    sodium_pct_delta?: number | null;
    hydration_pct_delta?: number | null;
    kcal_delta?: [number, number] | null;
    min_protein_g?: number | null;
    min_fiber_g?: number | null;
  };
  supplements: string[];
  constraints?: Record<string, unknown>;
  messages?: string[];
  warnings?: string[];
  trace: TraceEntry[];
}

/** Engine warnings, classified. Raw strings interpolate subject values; these do not. */
export type WarningKind =
  | "cold_start"
  | "cycle_undefined"
  | "no_baseline"
  | "layer2_conflict"
  | "tag_collision"
  | "zscore_fallback"
  | "uncategorised";

/**
 * Facts a client needs that the Decision does not carry in machine-readable form.
 *
 * Deliberately has NO `ui_state`. The engine emits three states and the product design needs
 * six; every mapping between them resolves an open spec question, so the mapping lives in
 * `packages/demo-fixtures/app-states.json` as reviewable data. See ADR 0006.
 */
export interface DecisionPresentation {
  fired_layers: number[];
  /** Rules whose conditions came out UNKNOWN. NOT the same as rules that did not fire. */
  unevaluable_rule_ids: string[];
  /** Rules skipped because validated-signals-only mode is on. */
  suppressed_rule_ids: string[];
  warning_kinds: WarningKind[];
}

/**
 * A Decision plus what is true *about* it.
 *
 * `decision_id` is the first 16 hex characters of sha256 over the canonical JSON of
 * `decision` — derived, not minted, which is why it needs no store to be resolvable. It is
 * computed once, in Python: JS and Python `JSON.stringify`/`json.dumps` disagree on number
 * formatting and escaping, so a second implementation would drift invisibly. Treat it as
 * opaque here.
 *
 * `decision` is transmitted byte-for-byte unmodified. Mutating it anywhere in the chain
 * breaks both the id and the schema validation.
 */
export interface DecisionEnvelope {
  envelope_version: 1;
  decision_id: string;
  decision: Decision;
  presentation: DecisionPresentation;
  engine: {
    rulebook_version: number;
    elemental_layer_enabled: boolean;
  };
}
