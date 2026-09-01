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
 * "Not applied" and "couldn't be checked" are rendered as separate blocks. Collapsing them
 * would be the exact dishonesty three-valued evaluation exists to prevent.
 */

import { ScrollView, StyleSheet, Text, View } from "react-native";

import type { DemoDay } from "@weyos/demo-fixtures";

import { Card, Disclaimer, Link, TraceRow, WarnBox } from "../components/primitives";
import { color, space, type } from "../theme/tokens";
import { LAYER_NAMES, layerPillar, longDate } from "./copy";

export function Trace({ day, onBack }: { day: DemoDay; onBack: () => void }) {
  const decision = day.decision;
  const fired = [...decision.fired_rules].sort((a, b) => a.layer - b.layer);
  const warnings = decision.warnings ?? [];
  const validatedOnly = decision.elemental_layer_enabled === false;

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
      {day.unevaluable.length > 0 && (
        <>
          <Text style={s.sect}>Not applied</Text>
          <TraceRow
            name="Couldn't be checked"
            layerLabel={`${day.unevaluable.length} rule${day.unevaluable.length === 1 ? "" : "s"} · unevaluable`}
            evidence={
              "A reading these need hasn't come through, so I left them alone rather than " +
              "assuming everything was fine."
            }
            off
          />
        </>
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
            {day.unevaluable.length > 0
              ? `\nunevaluable: ${day.unevaluable.join(", ")}`
              : ""}
            {validatedOnly ? "\nvalidated_only_layers = [1,2,5]" : ""}
          </Text>
        </Card>
      </View>

      {/* Boring, and the reason the screen is auditable. The pack shows a decision id here;
          decision.schema.json carries none today — Phase 3 adds it as a content hash. */}
      <Disclaimer
        extra={`Rulebook v${decision.rulebook_version} · ${longDate(decision.as_of)}${
          validatedOnly ? " · validated signals only" : ""
        }`}
      />
    </ScrollView>
  );
}

function layerLabel(layer: number): string {
  const name = LAYER_NAMES[layer] ?? `Layer ${layer}`;
  return layer === 4 ? `${name} · lowest priority` : `${name} · layer ${layer}`;
}

const s = StyleSheet.create({
  page: { backgroundColor: color.cream },
  content: { paddingHorizontal: 20, paddingBottom: 60 },
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
