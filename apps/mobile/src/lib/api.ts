import type { DecisionEnvelope, SignalSnapshot } from "@weyos/shared-schema";

import { config } from "./config";
import { supabase } from "./supabase";


export type Region = "UK" | "US";

/** Module J instrument items, as served by /v1/me/baseline/instrument. */
export interface InstrumentItem {
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
  items: InstrumentItem[];
}

/** The description a person reads back. Fragment keys are internal ids, never shown. */
export interface BaselineView {
  instrument_version: string;
  submitted_at: string;
  fragments: Array<{ key: string; text: string }>;
  personalising: boolean;
  energy_dip_at: string | null;
}

export interface IdentityAnswers {
  date_of_birth: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  waist_cm: number | null;
  usual_wake_time: string | null;
  usual_sleep_time: string | null;
  fixed_start: "no" | "some" | "yes" | null;
  work_pattern: "fixed" | "flexible" | "shift" | "self-directed" | null;
}

export const CONSENT_PURPOSES = [
  "health_data",
  "cycle_data",
  "lab_results",
  "location_environment",
  "notifications",
  "product_analytics",
] as const;
export type Purpose = (typeof CONSENT_PURPOSES)[number];
export type ConsentState = Record<Purpose, boolean>;

export interface Me {
  region: Region | null;
  /** Whether the food-profile answer has been given. The value itself stays server-side. */
  constitution_set: boolean;
  consents: ConsentState;
  onboarded: boolean;
  waist: { due: boolean; last_measured_on: string | null };
}

export interface T2Item {
  id: string;
  module: "D" | "E";
  type: "options" | "multi" | "time";
  question: string;
  options?: string[];
  exclusive_option?: string;
}

export type T2Answer = number | number[] | string;

export interface T2View {
  unlocked: boolean;
  unlocks_on: string | null;
  answered: number;
  total: number;
  answers: Record<string, T2Answer>;
}

export interface RulebookListing {
  version: number;
  rules: Array<{ id: string; name: string; layer: number; enabled: boolean }>;
}

export interface TraceView {
  decision_id: string;
  as_of: string;
  state: string;
  rulebook_version: number;
  elemental_layer_enabled?: boolean;
  fired_rules: DecisionEnvelope["decision"]["fired_rules"];
  trace: DecisionEnvelope["decision"]["trace"];
  warnings: string[];
  unevaluable_rule_ids: string[];
  suppressed_rule_ids: string[];
}

/**
 * A non-2xx response. `code` is the API's `error` field (`no_decision_yet`,
 * `consent_required`, `profile_incomplete` …) so screens can branch on meaning, not status.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`${status} ${code}`);
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (config === null || supabase === null) throw new ApiError(0, "not_configured");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    ...init,
    headers: {
      ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
      ...(token !== undefined ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  if (!response.ok) {
    // Error bodies carry a code only; the API never echoes values back.
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(response.status, body.error ?? "http_error");
  }
  return (await response.json()) as T;
}

const put = (body: unknown): RequestInit => ({ method: "PUT", body: JSON.stringify(body) });

export const api = {
  me: () => call<Me>("/v1/me"),
  updateProfile: (patch: { region?: Region; constitution?: { answer: 1 | 2 | 3 } }) =>
    call<Me>("/v1/me/profile", put(patch)),
  recordConsents: (decisions: Partial<ConsentState>, copyVersion: string) =>
    call<ConsentState>("/v1/me/consents", put({ copy_version: copyVersion, decisions })),
  deleteAccount: () =>
    call<{ data_erased: true; auth_account_deleted: boolean }>("/v1/me", { method: "DELETE" }),

  instrument: () => call<Instrument>("/v1/me/baseline/instrument"),
  baseline: () => call<BaselineView | null>("/v1/me/baseline"),
  submitBaseline: (body: {
    answers: Record<string, number>;
    energy_dip_at: string | null;
    corrected_fragment?: string;
  }) => call<BaselineView>("/v1/me/baseline", put(body)),
  identity: () => call<IdentityAnswers>("/v1/me/baseline/identity"),
  updateIdentity: (patch: Partial<IdentityAnswers>) => call<IdentityAnswers>("/v1/me/baseline/identity", put(patch)),

  waistHistory: () => call<Array<{ measured_on: string; waist_cm: number }>>("/v1/me/baseline/waist"),
  t2Instrument: () => call<{ instrument: string; instrument_version: string; items: T2Item[] }>("/v1/me/t2/instrument"),
  t2: () => call<T2View>("/v1/me/t2"),
  saveT2: (answers: Record<string, T2Answer>) => call<T2View>("/v1/me/t2", put({ answers })),

  ingest: (payload: Record<string, unknown>) =>
    call<{ accepted: true; decision_id: string }>("/v1/ingest/snapshot", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  today: () => call<DecisionEnvelope>("/v1/decision/today"),
  signals: () =>
    call<{
      decision_id: string;
      snapshot: SignalSnapshot | null;
      baselines: SignalSnapshot["baselines"] | null;
    }>("/v1/signals"),
  trace: (decisionId: string) =>
    call<TraceView>(`/v1/decision/${encodeURIComponent(decisionId)}/trace`),
  rulebook: () => call<RulebookListing>("/v1/rulebook"),
};
