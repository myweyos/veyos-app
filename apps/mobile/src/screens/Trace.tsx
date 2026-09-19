/**
 * C3 — "Why this?", the decision trace. Ported from the design pack.
 *
 * "The trust surface, and the artifact a clinical reviewer will ask for. Shows what did not
 * apply, and why."
 *
 *   back → title → "Every rule Weyos applied, most important first — and the ones it didn't"
 *   → fired rows (pillar-bordered, layer-ordered) → Not applied → Technical detail → provenance
 *
 * The title changes with the outcome: "Why nothing changed" when no live rule fired, "Why
 * tonight changed" when one did. Both are honest; only one of them is true on a given day.
 *
 * Rules that couldn't be evaluated are split by layer, as the pack draws them. A live signal
 * that didn't come through is "couldn't be checked". Cycle rules for someone who doesn't track
 * a cycle, and lab rules with no values on file, are "not applicable" rather than a gap. The
 * engine can't tell those apart yet (open question partial-is-narrowed-to-layer-1); the
 * client knows which data the subject chose to share, so it labels them. It decides nothing.
 */

import { ScrollView, StyleSheet, Text, View } from "react-native";

import { Card, Disclaimer, Link, TraceRow, WarnBox } from "../components/primitives";
import type { TodayModel } from "../lib/todayModel";
import { color, column, type } from "../theme/tokens";
import { LAYER_NAMES, layerPillar, longDate } from "./copy";

export function Trace({
  model,
  tracksCycle,
  onBack,
}: {
  model: TodayModel;
  tracksCycle: boolean;
  onBack: () => void;
}) {
  const decision = model.decision;
  const fired = [...decision.fired_rules].sort((a, b) => a.layer - b.layer);
  const warnings = decision.warnings ?? [];
  const validatedOnly = decision.elemental_layer_enabled === false;
  const unevaluable = model.envelope.presentation.unevaluable_rule_ids;
  const inLayer = (layer: number) => unevaluable.filter((id) => model.layerOf.get(id) === layer);
  const liveGaps = inLayer(1);
  const cycleRules = inLayer(2);
  const labRules = inLayer(5);

  // A live-biometric rule firing is what makes tonight "changed" rather than "unchanged".
  const liveRuleFired = fired.some((r) => r.layer === 1);

  return (
    <ScrollView style={s.page} contentContainerStyle={s.content} testID="screen-trace">
      <Link text="‹ Back to tonight" onPress={onBack} />
      <Text style={s.title}>{liveRuleFired ? "Why tonight changed" : "Why nothing changed"}</Text>
      <Text style={s.sub}>
        Every rule Weyos applied, most important first — and the ones it didn't.
      </Text>

      {fired.map((rule) => (
        <TraceRow
          key={rule.rule_id}
          name={rule.name ?? rule.rule_id}
          layerLabel={layerLabel(rule.layer)}
          evidence={(rule.because ?? []).join(" · ")}
          pillar={layerPillar(rule.layer)}
        />
      ))}

      {/* Absence is information. A trace that lists only hits reads as a justification
          rather than a record. */}
      {(liveGaps.length > 0 || cycleRules.length > 0 || labRules.length > 0) && (
        <Text style={s.sect}>Not applied</Text>
      )}
      {liveGaps.length > 0 && (
        <TraceRow
          name="Couldn't be checked"
          layerLabel={`${LAYER_NAMES[1]} · ${plural(liveGaps.length)} unevaluable`}
          evidence={
            "A reading these need hasn't come through, so I left them alone rather than " +
            "assuming everything was fine."
          }
          off
        />
      )}
      {cycleRules.length > 0 && (
        <TraceRow
          name={LAYER_NAMES[2] ?? "Cycle phase"}
          layerLabel="Layer 2"
          evidence={
            tracksCycle
              ? "Your cycle day hasn't come through, so cycle guidance couldn't be checked."
              : "Not applicable to you."
          }
          off
        />
      )}
      {labRules.length > 0 && (
        <TraceRow
          name={LAYER_NAMES[5] ?? "Lab results"}
          layerLabel="Layer 5"
          evidence="No lab values on file."
          off
        />
      )}

      {validatedOnly && (
        <TraceRow
          name="Your food profile and your environment"
          layerLabel="Layers 3 and 4 · suppressed"
          evidence="Switched off because validated signals only is on."
          off
        />
      )}

      {warnings.length > 0 && (
        <>
          <Text style={s.sect}>Where two guidelines disagreed</Text>
          {warnings.map((w) => (
            <WarnBox key={w} text={w} />
          ))}
        </>
      )}

      <View style={s.tech}>
        <Card flat>
          <Text style={s.techHead}>Technical detail</Text>
          <Text style={s.mono}>
            {fired.map((r) => `${r.rule_id} L${r.layer} p${r.priority}`).join("  ·  ")}
            {unevaluable.length > 0 ? `\nunevaluable: ${unevaluable.join(", ")}` : ""}
            {validatedOnly ? "\nvalidated_only_layers = [1,2,5]" : ""}
          </Text>
        </Card>
      </View>

      {/* Boring, and the reason the screen is auditable: the rulebook version and the
          content-hash decision id (ADR 0006) identify exactly what was decided. */}
      <Disclaimer
        extra={`Rulebook v${decision.rulebook_version} · decision ${model.envelope.decision_id} · ${longDate(
          decision.as_of,
        )}${validatedOnly ? " · validated signals only" : ""}`}
      />
    </ScrollView>
  );
}

const plural = (n: number): string => `${n} rule${n === 1 ? "" : "s"}`;

function layerLabel(layer: number): string {
  const name = LAYER_NAMES[layer] ?? `Layer ${layer}`;
  return layer === 4 ? `${name} · lowest priority` : `${name} · layer ${layer}`;
}

const s = StyleSheet.create({
  page: { backgroundColor: color.cream },
  content: { ...column, paddingHorizontal: 20, paddingBottom: 60 },
  title: {
    fontSize: type.title.size,
    fontWeight: "600",
    letterSpacing: -0.3,
    color: color.ink,
    marginTop: 16,
    marginBottom: 4,
  },
  sub: { fontSize: type.sub.size, lineHeight: type.sub.size * 1.5, color: color.muted },
  sect: {
    fontSize: type.section.size,
    color: color.muted,
    textTransform: "uppercase",
    letterSpacing: 1.15,
    fontWeight: "600",
    marginTop: 24,
    marginBottom: 10,
  },
  tech: { marginTop: 18 },
  techHead: { fontSize: 12.5, fontWeight: "600", color: color.muted },
  mono: { fontSize: 12.5, color: color.muted, marginTop: 6, lineHeight: 19 },
});
