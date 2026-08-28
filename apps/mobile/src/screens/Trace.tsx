/**
 * C3 — "Why this?", the decision trace.
 *
 * The trace is not a debug artifact. It is the product's trust surface, its differentiator
 * against a black-box wellness app, and the document a regulator will ask for. It gets a
 * first-class screen, not a tooltip.
 *
 * Requirements, all load-bearing:
 *
 *   - Show rules that did NOT apply, and why. Absence is information; a trace that lists
 *     only hits reads as a justification rather than a record.
 *   - Distinguish "did not apply" from "could not be evaluated". An unevaluable rule is not
 *     a rule that came out false, and collapsing the two is exactly the dishonesty the
 *     three-valued logic exists to prevent.
 *   - Show collision warnings where the engine raised one.
 *   - Show the rulebook version. Boring, and the thing that makes the screen auditable.
 *   - Plain English only. Rule ids live in a collapsed technical block for support and QA.
 */

import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { DemoDay } from "@weyos/demo-fixtures";

import { Disclaimer, EngineWarning } from "../components/primitives";
import { radius, space, type } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";
import { LAYER_NAMES } from "./copy";

export function Trace({ day, onBack }: { day: DemoDay; onBack: () => void }) {
  const palette = useTheme();
  const decision = day.decision;
  const [showTechnical, setShowTechnical] = useState(false);

  const fired = [...decision.fired_rules].sort((a, b) => a.layer - b.layer);

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={st.page}
      testID="screen-trace"
    >
      <Pressable onPress={onBack} accessibilityRole="button">
        <Text style={[st.back, { color: palette.textMuted }]}>← Back</Text>
      </Pressable>

      <Text style={[st.h1, { color: palette.text }]}>Why today changed</Text>

      {fired.map((rule) => (
        <View key={rule.rule_id} style={st.block}>
          <Text style={[st.layer, { color: palette.text }]}>
            ▸ {LAYER_NAMES[rule.layer] ?? `Layer ${rule.layer}`}
          </Text>
          {(rule.because ?? []).map((line) => (
            <Text key={line} style={[st.reason, { color: palette.textMuted }]}>
              {line}
            </Text>
          ))}
        </View>
      ))}

      {/* Absence is information. Not the same thing as "did not apply". */}
      {day.unevaluable.length > 0 && (
        <View style={st.block}>
          <Text style={[st.layer, { color: palette.textMuted }]}>Couldn't be checked</Text>
          <Text style={[st.reason, { color: palette.textMuted }]}>
            {day.unevaluable.length} guideline
            {day.unevaluable.length === 1 ? "" : "s"} needed a reading I don't have today, so I
            left {day.unevaluable.length === 1 ? "it" : "them"} alone rather than assuming
            everything was fine.
          </Text>
        </View>
      )}

      {decision.warnings !== undefined && decision.warnings.length > 0 && (
        <View style={st.block}>
          <Text style={[st.layer, { color: palette.text }]}>Where two guidelines disagreed</Text>
          {decision.warnings.map((warning) => (
            <EngineWarning key={warning} text={warning} />
          ))}
        </View>
      )}

      {/* Boring, and the reason this screen is auditable. decision_id lands in Phase 3 —
          the Decision contract carries no id today. See DESIGN-DEBT.md. */}
      <View style={[st.provenance, { borderColor: palette.border }]}>
        <Text style={[st.meta, { color: palette.textMuted }]}>
          Rulebook v{decision.rulebook_version} · {decision.as_of}
          {decision.elemental_layer_enabled === false ? " · validated signals only" : ""}
        </Text>
      </View>

      <Pressable onPress={() => setShowTechnical(!showTechnical)} accessibilityRole="button">
        <Text style={[st.toggle, { color: palette.textMuted }]}>
          {showTechnical ? "Hide" : "Show"} technical detail
        </Text>
      </Pressable>

      {showTechnical && (
        <View style={[st.technical, { borderColor: palette.border }]}>
          {fired.map((rule) => (
            <Text key={rule.rule_id} style={[st.mono, { color: palette.textMuted }]}>
              {rule.rule_id}  L{rule.layer}  p{rule.priority}  {rule.name ?? ""}
            </Text>
          ))}
          {day.unevaluable.map((id) => (
            <Text key={id} style={[st.mono, { color: palette.textMuted }]}>
              {id}  unevaluable
            </Text>
          ))}
        </View>
      )}

      <Disclaimer />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  page: { padding: space.lg, paddingTop: space.xl * 2, paddingBottom: space.xl },
  back: { fontSize: type.label, marginBottom: space.md },
  h1: { fontSize: type.display, marginBottom: space.lg },
  block: { marginBottom: space.lg },
  layer: { fontSize: type.body, marginBottom: space.xs },
  reason: { fontSize: type.label, lineHeight: type.label * 1.5, marginLeft: space.md },
  provenance: { borderTopWidth: 1, paddingTop: space.md, marginTop: space.sm },
  meta: { fontSize: type.caption },
  toggle: { fontSize: type.caption, marginTop: space.md },
  technical: { borderWidth: 1, borderRadius: radius.sm, padding: space.sm, marginTop: space.sm },
  mono: { fontSize: type.caption, fontFamily: "monospace", lineHeight: type.caption * 1.6 },
});
