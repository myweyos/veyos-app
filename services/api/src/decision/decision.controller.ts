import { Controller, Get, Header, Param, Query, UseGuards } from "@nestjs/common";
import type { DecisionEnvelope } from "@weyos/shared-schema";

import { AuthGuard, CurrentSubject, type AuthedSubject } from "../auth/auth.guard";
import { DecisionService } from "./decision.service";

/**
 * The read surface, for the signed-in subject only.
 *
 * Five endpoints, all projections of the subject's latest stored envelope (see
 * DecisionService). There is no `subject_ref` parameter: the subject comes from the token.
 */
@Controller("v1")
@UseGuards(AuthGuard)
export class DecisionController {
  constructor(private readonly decisions: DecisionService) {}

  @Get("decision/today")
  @Header("cache-control", "no-store")
  async today(@CurrentSubject() subject: AuthedSubject): Promise<DecisionEnvelope> {
    return this.decisions.today(subject.subjectRef);
  }

  /**
   * The trace screen's data. Projects `fired_rules` (with their `because` lines) and the
   * ordered `trace`, plus the unevaluable set — which is NOT the same as "did not apply", and
   * the two must stay distinguishable.
   */
  @Get("decision/:id/trace")
  @Header("cache-control", "no-store")
  async trace(@CurrentSubject() subject: AuthedSubject, @Param("id") id: string) {
    const envelope = await this.decisions.byDecisionId(id, subject.subjectRef);
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
   * What we read for the latest decision.
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
  async signals(@CurrentSubject() subject: AuthedSubject) {
    const envelope = await this.decisions.today(subject.subjectRef);
    return {
      decision_id: envelope.decision_id,
      snapshot: await this.decisions.snapshotFor(subject.subjectRef, envelope.decision.as_of),
      coverage: {
        unevaluable_rule_ids: envelope.presentation.unevaluable_rule_ids,
        warning_kinds: envelope.presentation.warning_kinds,
      },
    };
  }

  @Get("plan")
  @Header("cache-control", "no-store")
  async plan(@CurrentSubject() subject: AuthedSubject) {
    const envelope = await this.decisions.today(subject.subjectRef);
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
   * `?slot=` is matched loosely on purpose: the engine synthesises an `additions` slot which
   * is NOT in the snapshot schema's slot enum, and validating against that enum would reject
   * the one slot the user most needs to see — the things the engine put on their plate.
   */
  @Get("meal")
  @Header("cache-control", "no-store")
  async meal(@CurrentSubject() subject: AuthedSubject, @Query("slot") slot?: string) {
    const envelope = await this.decisions.today(subject.subjectRef);
    const food = envelope.decision.food;
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
