// GENERATED FILE — do not edit. Run npm run generate.
// Source: packages/shared-schema/schemas/*.schema.json

// --- signal-snapshot.schema.json ---
/**
 * This interface was referenced by `SignalSnapshot`'s JSON-Schema
 * via the `definition` "labValue".
 */
export type LabValue = {
  value?: number | null;
  unit?: string | null;
  status: "normal" | "high" | "low" | "unknown";
  collected_on?: string | null;
} | null;

/**
 * The canonical normalised signal payload. Every source (HealthKit, Health Connect, BLE chest strap, manual lab entry) normalises INTO this shape at ingestion. Nothing downstream ever sees a vendor-specific field. This schema is the contract between mobile, api and engine.
 */
export interface SignalSnapshot {
  schema_version: 1;
  /**
   * Pseudonymous subject reference. NEVER a name, email or device id. Art.9 special-category data is keyed by this and nothing else.
   */
  subject_ref: string;
  /**
   * Local date the snapshot describes.
   */
  as_of: string;
  /**
   * IANA tz of the subject at as_of.
   */
  timezone?: string;
  /**
   * All fields optional: cold start and partial-permission states are normal, not errors.
   */
  biometrics?: {
    /**
     * RMSSD, milliseconds.
     */
    hrv_ms?: number | null;
    rhr_bpm?: number | null;
    /**
     * Combined deep+REM as % of total sleep. NOT a vendor composite sleep score — see open spec question on rule 1.2.
     */
    sleep_deep_rem_pct?: number | null;
    /**
     * Vendor composite, carried for display only. Rules must not read this.
     */
    sleep_score?: number | null;
    /**
     * Deviation from the subject's own temperature baseline, degrees C.
     */
    wrist_temp_delta_c?: number | null;
    steps?: number | null;
    source?: "healthkit" | "health_connect" | "ble" | "manual" | "simulated";
    captured_at?: string;
  };
  /**
   * Trailing baselines computed on device. Required for any percent/zscore comparison; absent baselines make the dependent rules unevaluable rather than false.
   */
  baselines?: {
    hrv_ms?: number | null;
    /**
     * Historical SD, for zscore comparison mode.
     */
    hrv_sd?: number | null;
    rhr_bpm?: number | null;
    rhr_sd?: number | null;
    sleep_deep_rem_pct?: number | null;
    days_of_history?: number;
    window_days?: number;
  };
  cycle?: {
    /**
     * 1-indexed. Values > 28 are currently UNDEFINED in the rulebook — the engine returns an unresolved-input warning rather than guessing.
     */
    cycle_day?: number | null;
    cycle_length?: number | null;
    tracked?: boolean;
  } | null;
  constitution: {
    dosha: "vata" | "pitta" | "kapha";
  };
  environment?: {
    ambient_temp_c?: number | null;
    moon_phase?: "new" | "waxing" | "full" | "waning" | null;
    season?: "spring" | "summer" | "autumn" | "winter" | null;
    wind_kph?: number | null;
    /**
     * Carried but NOT consumed by any enabled rule. Candidate rule 4.4.
     */
    pollen_index?: number | null;
    aqi?: number | null;
  };
  /**
   * Layer 5 fires only when a value is present AND flagged abnormal. Absent != normal.
   */
  labs?: {
    pm_cortisol?: LabValue;
    hs_crp?: LabValue;
    hba1c?: LabValue;
    fasting_glucose?: LabValue;
  };
  planned_activity?: {
    /**
     * e.g. hiit, lifting, run, yoga, pilates, walking
     */
    type?: string;
    intensity?: "rest" | "low" | "moderate" | "high" | "max";
    location?: "indoor" | "outdoor" | "outdoor_midday";
    planned_at?: string;
  } | null;
  planned_meals?: {
    slot: "breakfast" | "lunch" | "dinner" | "snack";
    items: {
      name: string;
      /**
       * Controlled vocabulary — see packages/shared-schema/schemas/food-tags.json
       */
      tags: string[];
    }[];
  }[];
}

// --- decision.schema.json ---
/**
 * The engine's output. Every field is explainable: no value appears here without a rule id in `trace` that produced it. This is what the execution layer turns into notifications and what the UI renders.
 */
export interface Decision {
  schema_version: 1;
  subject_ref: string;
  as_of: string;
  rulebook_version: number;
  elemental_layer_enabled?: boolean;
  /**
   * `calm` == only the always-on L3 baseline fired: show 'in balance today', no intervention. `insufficient_baseline` == cold start.
   */
  state: "calm" | "intervention" | "insufficient_baseline";
  fired_rules: {
    rule_id: string;
    name?: string;
    layer: 1 | 2 | 3 | 4 | 5;
    priority: number;
    /**
     * Human-readable condition evaluations. Deltas and thresholds only — never a raw value tied to a subject.
     */
    because?: string[];
  }[];
  activity: {
    verdict: "allow" | "downgrade" | "substitute" | "relocate" | "rest";
    planned?: string | null;
    prescribed?: string | null;
    location?: string | null;
    /**
     * Rule id that won activity resolution.
     */
    decided_by?: string | null;
  };
  food: {
    meals: {
      slot: string;
      items: FoodItem[];
      /**
       * Each removal carries the rule id that removed it.
       */
      removed: RemovedItem[];
    }[];
    mandated_tags?: string[];
    blocked_tags?: string[];
    sodium_pct_delta?: number | null;
    hydration_pct_delta?: number | null;
    /**
     * @minItems 2
     * @maxItems 2
     */
    kcal_delta?: [number, number] | null;
    min_protein_g?: number | null;
    min_fiber_g?: number | null;
  };
  supplements: string[];
  constraints?: {
    [k: string]: unknown;
  };
  messages?: string[];
  /**
   * Non-fatal input problems the product must surface rather than swallow — e.g. cycle_day > 28, missing baseline for an otherwise-firing rule.
   */
  warnings?: string[];
  /**
   * Ordered log of every mutation applied during resolution, each with the rule id responsible. This is the audit trail; it is what makes the engine defensible in a regulatory conversation.
   */
  trace: {
    step: "evaluate" | "activity" | "food" | "supplements" | "constraints";
    rule_id: string;
    detail: string;
  }[];
}
export interface FoodItem {
  name: string;
  /**
   * Controlled vocabulary — see packages/shared-schema/schemas/food-tags.json
   */
  tags: string[];
}
export interface RemovedItem {
  name: string;
  rule_id: string;
  reason: string;
}

// --- decision-envelope.schema.json ---
/**
 * A Decision plus the things that are true ABOUT it rather than in it: a content-derived id, and facts a client needs that the Decision does not carry. Additive — decision.json is unchanged and its schema_version stays 1. See docs/adr/0006-decision-identity-and-envelope.md.
 */
export interface DecisionEnvelope {
  envelope_version: 1;
  /**
   * First 16 hex characters of sha256 over the canonical JSON of `decision`. Derived, not minted: the engine is pure and its determinism is proved by test_engine_is_deterministic, so the same snapshot against the same rulebook yields the same id anywhere, with no store. Anyone holding this payload can recompute it. This is CONTENT identity — the same person on two identical days gets the same id — not delivery identity.
   */
  decision_id: string;
  decision: Decision;
  /**
   * Re-projections of facts already inside the decision, so a client does not have to string-parse the trace. Deliberately carries NO ui_state: the engine emits three states and the product needs six, and every mapping between them resolves an open spec question. Its absence is the statement.
   */
  presentation: {
    fired_layers: number[];
    /**
     * Rules whose conditions came out UNKNOWN. Not the same as rules that did not fire.
     */
    unevaluable_rule_ids: string[];
    /**
     * Rules skipped because validated-signals-only mode is on.
     */
    suppressed_rule_ids: string[];
    /**
     * Engine warnings classified into kinds. The raw strings interpolate subject values (days_of_history, cycle_day) and are carried in decision.warnings for the subject's own device — never in a log. Classification happens in Python beside the engine, not by prefix-matching prose in a controller.
     */
    warning_kinds: (
      | "cold_start"
      | "cycle_undefined"
      | "no_baseline"
      | "layer2_conflict"
      | "tag_collision"
      | "zscore_fallback"
      | "uncategorised"
    )[];
  };
  engine: {
    rulebook_version: number;
    elemental_layer_enabled: boolean;
  };
}
