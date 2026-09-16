/**
 * @weyos/phenotype — Module J scoring and description (SCRUM-89, SCRUM-90).
 *
 * The instrument is DATA (module-j.v1.json): questions, weights, thresholds and the fragment
 * library. This module applies it and decides nothing on its own. Three layers, kept apart:
 *
 *   answers (durable)  →  trait scores (internal, never shown)  →  description (the only thing
 *                                                                    a person sees)
 *
 * Trait scores carry a confidence. The engine personalises only above the gate; self-report at
 * signup sits below it, so a fresh profile drives nothing until device data arrives.
 */

import instrument from "../module-j.v1.json";

export type AxisId = "T1" | "T2" | "T3" | "T4" | "T5" | "T6";
export type Band = "low" | "mid" | "high";

export interface Item {
  id: string;
  type: "options" | "scale" | "time_or_none";
  question: string;
  options?: string[];
  low?: string;
  high?: string;
  none_label?: string;
}

export interface Instrument {
  instrument: string;
  instrument_version: string;
  schema_version: string;
  items: Item[];
  axes: Array<{ id: AxisId; name: string; terms: Array<{ item: string; weight: number; inverted?: boolean }> }>;
  scoring: { answer_min: number; answer_max: number };
  confidence: {
    gate: number;
    sources: Record<string, number>;
    caps: Partial<Record<AxisId, number>>;
  };
  description: {
    low_at_or_below: number;
    high_at_or_above: number;
    max_fragments: number;
    fragments: Record<AxisId, { low: string; high: string }>;
    pairs: Array<{ id: string; when: Partial<Record<AxisId, "low" | "high">>; text: string }>;
  };
}

export const MODULE_J = instrument as unknown as Instrument;

/** Scored answers: item id → 1–5. J5b (the energy dip) is unscored and lives elsewhere. */
export type Answers = Record<string, number>;

export interface Trait {
  score: number; // 0–100, one decimal
  confidence: number; // 0–1
}
export type Traits = Record<AxisId, Trait>;

export type ConfidenceSource = keyof Instrument["confidence"]["sources"];

/** Item ids that carry weight in the current instrument version. */
export function scoredItems(model: Instrument = MODULE_J): string[] {
  const ids = new Set<string>();
  for (const axis of model.axes) for (const term of axis.terms) ids.add(term.item);
  return model.items.filter((i) => ids.has(i.id)).map((i) => i.id);
}

/** Every item that must be answered (scored or not), except free-form ones. */
export function requiredItems(model: Instrument = MODULE_J): string[] {
  return model.items.filter((i) => i.type !== "time_or_none").map((i) => i.id);
}

export function validateAnswers(answers: Answers, model: Instrument = MODULE_J): string[] {
  const problems: string[] = [];
  const { answer_min, answer_max } = model.scoring;
  for (const id of requiredItems(model)) {
    const v = answers[id];
    if (v === undefined) problems.push(`${id}: missing`);
    else if (!Number.isInteger(v) || v < answer_min || v > answer_max) {
      problems.push(`${id}: not an integer in ${answer_min}–${answer_max}`);
    }
  }
  return problems;
}

/**
 * Six axis scores from the answers. normalise(x) = (x − 1) / 4 × 100 on the weighted 1–5
 * answer; an inverted term contributes (6 − answer). Rounded to one decimal, as the worked
 * example does.
 */
export function score(
  answers: Answers,
  source: ConfidenceSource = "self_report_onboarding",
  model: Instrument = MODULE_J,
): Traits {
  const problems = validateAnswers(answers, model);
  if (problems.length > 0) throw new Error(`invalid answers: ${problems.join("; ")}`);
  const { answer_min, answer_max } = model.scoring;
  const span = answer_max - answer_min;
  const base = model.confidence.sources[source];
  if (base === undefined) throw new Error(`unknown confidence source ${source}`);

  const out = {} as Traits;
  for (const axis of model.axes) {
    let weighted = 0;
    for (const term of axis.terms) {
      const v = answers[term.item] as number;
      weighted += term.weight * (term.inverted === true ? answer_min + answer_max - v : v);
    }
    const cap = model.confidence.caps[axis.id];
    out[axis.id] = {
      score: Math.round(((weighted - answer_min) / span) * 1000) / 10,
      confidence: cap === undefined ? base : Math.min(base, cap),
    };
  }
  return out;
}

export function band(value: number, model: Instrument = MODULE_J): Band {
  if (value <= model.description.low_at_or_below) return "low";
  if (value >= model.description.high_at_or_above) return "high";
  return "mid";
}

export interface Fragment {
  /** Axis id, or a pair id such as "T1+T2". Internal: never shown as a label. */
  key: string;
  text: string;
}

/**
 * The sentences a person reads: the most distinctive traits, outside the middle band, read
 * back in trait order. A pair rule collapses two fragments that would say the same thing.
 *
 * Returns fragments, not a joined string, so the client can put a "that doesn't sound like
 * me" control under each one.
 */
export function describe(traits: Traits, model: Instrument = MODULE_J): Fragment[] {
  const { fragments, pairs, max_fragments } = model.description;
  type Cand = Fragment & { distance: number; order: number };
  let cands: Cand[] = [];
  model.axes.forEach((axis, order) => {
    const s = traits[axis.id].score;
    const b = band(s, model);
    if (b === "mid") return;
    cands.push({ key: axis.id, text: fragments[axis.id][b], distance: Math.abs(s - 50), order });
  });
  for (const pair of pairs) {
    const members = Object.entries(pair.when) as Array<[AxisId, "low" | "high"]>;
    const hit = members.every(([axis, b]) => band(traits[axis].score, model) === b);
    if (!hit) continue;
    const merged = cands.filter((c) => members.some(([axis]) => axis === c.key));
    cands = cands.filter((c) => !members.some(([axis]) => axis === c.key));
    cands.push({
      key: pair.id,
      text: pair.text,
      distance: Math.max(...merged.map((c) => c.distance)),
      order: Math.min(...merged.map((c) => c.order)),
    });
  }
  cands.sort((a, b) => b.distance - a.distance);
  const kept = cands.slice(0, max_fragments);
  kept.sort((a, b) => a.order - b.order);
  return kept.map(({ key, text }) => ({ key, text }));
}

/** Whether the engine may personalise on this trait. */
export function personalises(trait: Trait, model: Instrument = MODULE_J): boolean {
  return trait.confidence >= model.confidence.gate;
}
