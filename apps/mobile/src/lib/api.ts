import type { DecisionEnvelope, SignalSnapshot } from "@weyos/shared-schema";

import { config } from "./config";
import { supabase } from "./supabase";

export type Dosha = "vata" | "pitta" | "kapha";
export type Region = "UK" | "US";

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
  constitution: { dosha: Dosha } | null;
  consents: ConsentState;
  onboarded: boolean;
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
  updateProfile: (patch: { region?: Region; constitution?: { dosha: Dosha } }) =>
    call<Me>("/v1/me/profile", put(patch)),
  recordConsents: (decisions: Partial<ConsentState>, copyVersion: string) =>
    call<ConsentState>("/v1/me/consents", put({ copy_version: copyVersion, decisions })),
  deleteAccount: () =>
    call<{ data_erased: true; auth_account_deleted: boolean }>("/v1/me", { method: "DELETE" }),

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
