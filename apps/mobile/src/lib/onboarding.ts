import type { Href } from "expo-router";

import type { Me } from "./api";

/**
 * The first onboarding step the account hasn't answered, or null when it's onboarded.
 *
 * Mirrors the API's `onboarded` rule: region (A3), health-data consent (A4), constitution
 * (A7). Cycle setup (A6) and connecting Health Connect (A10) are optional and aren't gated.
 */
export function firstUnfinishedStep(me: Me): Href<string> | null {
  if (me.region === null) return "/onboarding/region";
  if (!me.consents.health_data) return "/onboarding/consent";
  if (me.constitution === null) return "/onboarding/food";
  return null;
}

/** Copy version of the A4 consent screen. Stored with every consent decision. */
export const CONSENT_COPY_VERSION = "a4-v0.5-2026-09-14";
