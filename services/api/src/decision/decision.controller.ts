import { Controller, Get, Header, Param, Query } from "@nestjs/common";
import type { DecisionEnvelope } from "@weyos/shared-schema";

import { DecisionService } from "./decision.service";
import type { PersonaId, PersonaState, Selector } from "./personas.source";

function selectorFrom(q: Record<string, string | undefined>): Selector {
  const selector: Selector = {};
  if (q["subject_ref"] !== undefined) selector.subjectRef = q["subject_ref"];
  if (q["persona"] !== undefined) selector.persona = q["persona"] as PersonaId;
  if (q["state"] !== undefined) selector.state = q["state"] as PersonaState;
  if (q["elemental"] !== undefined) selector.elemental = q["elemental"] !== "false";
  return selector;
}

/**
 * The read surface.
 *
 * Five endpoints, all projections of one envelope. Each carries the decision id and rulebook
 * version as headers so any screen can deep-link to the trace without re-deriving anything.
 */
@Controller("v1")
export class DecisionController {
  constructor(private readonly decisions: DecisionService) {}

  @Get("decision/today")
  @Header("cache-control", "no-store")
  async today(@Query() query: Record<string, string>): Promise<DecisionEnvelope> {
    // `as_of` comes from the snapshot, never from a server clock — so "today" is aspirational
    // until persistence lands and there is a real latest-snapshot to fetch. Flagged rather
    // than papered over by substituting Date.now().
    return this.decisions.forSelector(selectorFrom(query));
  }

  /**
   * The trace screen's data. Projects `fired_rules` (with their `because` lines) and the
   * ordered `trace`, plus the unevaluable set — which is NOT the same as "did not apply", and
   * the two must stay distinguishable.
   */
  @Get("decision/:id/trace")
  @Header("cache-control", "no-store")
  trace(@Param("id") id: string) {
    const envelope = this.decisions.byDecisionId(id);
    const d = envelope.decision;
    return {
      decision_id: envelope.decision_id,
      as_of: d.as_of,
      state: d.state,
      rulebook_version: d.rulebook_version,
      elemental_layer_enabled: d.elemental_layer_enabled,
      fired_rules: d.fired_rules,
      trace: d.trace,
      warnings: d.warnings ?? [],
      unevaluable_rule_ids: envelope.presentation.unevaluable_rule_ids,
      suppressed_rule_ids: envelope.presentation.suppressed_rule_ids,
    };
  }

  /**
   * What we read today.
   *
   * Returns the snapshot as-is. It is literally biometrics, going to the subject's own device
   * — legitimate, and the reason `no-store` is on every response here.
   *
   * Deliberately does NOT compute "HRV is 22% below baseline". That is a baseline comparison,
   * i.e. rule logic outside the engine, and it is exactly what the CI guardrail grep exists to
   * catch. The delta the engine actually used is already prose in `fired_rules[].because`.
   */
  @Get("signals")
  @Header("cache-control", "no-store")
  async signals(@Query() query: Record<string, string>) {
    const selector = selectorFrom(query);
    const envelope = await this.decisions.forSelector(selector);
    return {
      decision_id: envelope.decision_id,
      snapshot: this.decisions.snapshotFor(selector),
      coverage: {
        unevaluable_rule_ids: envelope.presentation.unevaluable_rule_ids,
        warning_kinds: envelope.presentation.warning_kinds,
      },
    };
  }

  @Get("plan")
  @Header("cache-control", "no-store")
  async plan(@Query() query: Record<string, string>) {
    const envelope = await this.decisions.forSelector(selectorFrom(query));
    const d = envelope.decision;
    return {
      decision_id: envelope.decision_id,
      as_of: d.as_of,
      state: d.state,
      activity: d.activity,
      supplements: d.supplements,
      constraints: d.constraints ?? {},
      messages: d.messages ?? [],
    };
  }

  /**
   * Tonight's plate.
   *
   * Named `/meal` per the build plan even though the payload is a list of meals; `/meals`
   * would be more honest. Noted rather than silently renamed.
   *
   * `?slot=` is matched loosely on purpose: the engine synthesises an `additions` slot which
   * is NOT in the snapshot schema's slot enum, and validating against that enum would reject
   * the one slot the user most needs to see — the things the engine put on their plate.
   */
  @Get("meal")
  @Header("cache-control", "no-store")
  async meal(@Query() query: Record<string, string>) {
    const envelope = await this.decisions.forSelector(selectorFrom(query));
    const food = envelope.decision.food;
    const slot = query["slot"];
    return {
      decision_id: envelope.decision_id,
      meals: slot === undefined ? food.meals : food.meals.filter((m) => m.slot === slot),
      mandated_tags: food.mandated_tags ?? [],
      blocked_tags: food.blocked_tags ?? [],
      sodium_pct_delta: food.sodium_pct_delta ?? null,
      hydration_pct_delta: food.hydration_pct_delta ?? null,
      kcal_delta: food.kcal_delta ?? null,
      min_protein_g: food.min_protein_g ?? null,
      min_fiber_g: food.min_fiber_g ?? null,
      // Collisions are surfaced, never filtered. The ginger-for-a-Pitta case (F10) is the
      // point: L1 outranks L3 so the item stays, and the user is told the two disagreed.
      collisions: (envelope.decision.warnings ?? []).filter((w) =>
        w.includes("per-item substitution is unresolved"),
      ),
    };
  }
}
