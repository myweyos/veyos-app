/**
 * C3 — "Why this?", the decision trace.
 *
 * The trust surface, and the same artifact a clinical reviewer will ask to see. Not a
 * tooltip.
 *
 * Layer-ordered, each row bordered in its layer's pillar colour. Shows rules that did NOT
 * apply, dimmed rather than omitted — absence is information, and a trace listing only hits
 * reads as a justification rather than a record. Keeps "did not apply" distinct from "could
 * not be checked".
 */

import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import type { DemoDay } from "@weyos/demo-fixtures";

import { Disclaimer, Link, TraceRow, WarnBox } from "../components/primitives";
import { color, space, type } from "../theme/tokens";
import { LAYER_NAMES, layerPillar } from "./copy";

export function Trace({ day, onBack }: { day: DemoDay; onBack: () => void }) {
  const decision = day.decision;
  const [technical, setTechnical] = useState(false);
  const fired = [...decision.fired_rules].sort((a, b) => a.layer - b.layer);
  const warnings = decision.warnings ?? [];

  return (
    <ScrollView style={s.page} contentContainerStyle={s.content} testID="screen-trace">
      <Link text="‹ Back" onPress={onBack} />
      <Text style={s.h1}>Why tonight changed</Text>

      {fired.map((rule) => (
        <TraceRow
          key={rule.rule_id}
          name={rule.name ?? rule.rule_id}
          layerLabel={LAYER_NAMES[rule.layer] ?? `Layer ${rule.layer}`}
          evidence={(rule.because ?? []).join(" · ")}
          pillar={layerPillar(rule.layer)}
        />
      ))}

      {/* Could not be checked — deliberately NOT the same as "did not apply". */}
      {day.unevaluable.length > 0 && (
        <>
          <Text style={s.sect}>Couldn't be checked</Text>
          <TraceRow
            name={`${day.unevaluable.length} guideline${day.unevaluable.length === 1 ? "" : "s"}`}
            layerLabel="Not evaluated"
            evidence={
              "A reading these needed hasn't come through, so I left them alone rather than " +
              "assuming everything was fine."
            }
            off
          />
        </>
      )}

      {warnings.length > 0 && (
        <>
          <Text style={s.sect}>Where two guidelines disagreed</Text>
          {warnings.map((w) => (
            <WarnBox key={w} text={w} />
          ))}
        </>
      )}

      {/* Boring, and the reason this screen is auditable. decision_id lands in Phase 3 — the
          Decision contract carries no id today. */}
      <View style={s.provenance}>
        <Text style={s.meta}>
          Rulebook v{decision.rulebook_version} · {decision.as_of}
          {decision.elemental_layer_enabled === false ? " · validated signals only" : ""}
        </Text>
      </View>

      <Link
        text={technical ? "Hide technical detail" : "Show technical detail"}
        onPress={() => setTechnical(!technical)}
      />

      {technical && (
        <View style={s.tech}>
          {fired.map((r) => (
            <Text key={r.rule_id} style={s.mono}>
              {r.rule_id}  L{r.layer}  p{r.priority}  {r.name ?? ""}
            </Text>
          ))}
          {day.unevaluable.map((id) => (
            <Text key={id} style={s.mono}>
              {id}  unevaluable
            </Text>
          ))}
        </View>
      )}

      <Disclaimer />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { backgroundColor: color.cream },
  content: { paddingHorizontal: 20, paddingBottom: 60, paddingTop: space.sm },
  h1: { ...{ fontSize: type.title.size, fontWeight: "600" }, color: color.ink, marginVertical: 16 },
  sect: {
    fontSize: type.section.size,
    color: color.muted,
    textTransform: "uppercase",
    letterSpacing: 1.15,
    fontWeight: "600",
    marginTop: 24,
  },
  provenance: { borderTopWidth: 1, borderTopColor: color.line, paddingTop: 14, marginTop: 20 },
  meta: { fontSize: 12, color: color.muted },
  tech: {
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
  },
  mono: { fontSize: 11.5, fontFamily: "monospace", color: color.muted, lineHeight: 19 },
});
