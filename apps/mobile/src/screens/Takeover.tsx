/**
 * C2 — the intervention takeover. The screen the product lives or dies on.
 *
 * Strict three-part vertical structure, and the order is NOT negotiable:
 *
 *   1. WHAT CHANGED   evidence first
 *   2. WHAT I'M DOING the strikethrough on the user's own plan, then the replacement
 *   3. ACTIONS        thumb zone
 *
 * Evidence before instruction. A user told what to do before being told why reads it as
 * nagging.
 *
 * The strikethrough is load-bearing. The user must see THEIR OWN plan being changed, not a
 * generic suggestion appearing — which is also why Plan is one of the four tabs.
 *
 * "Not for me" is always present, always the same distance away, never hidden behind a timer
 * and never smaller on a second showing.
 *
 * No red, no siren iconography, no heart-rate-alarm visual language. Intervention is warm
 * amber (Fire). `danger` is reserved for destructive account actions.
 */

import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { DemoDay } from "@weyos/demo-fixtures";

import { Disclaimer, EngineWarning, Pill } from "../components/primitives";
import { radius, space, type } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

export function Takeover({
  day,
  onWhyThis,
  onDismiss,
}: {
  day: DemoDay;
  onWhyThis: () => void;
  onDismiss: () => void;
}) {
  const palette = useTheme();
  const decision = day.decision;
  const activity = decision.activity;

  // Evidence, straight from the rules that fired. Deltas and thresholds only — these strings
  // never carry a raw value bound to a subject.
  const evidence = decision.fired_rules.flatMap((rule) => rule.because ?? []);

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={st.page}
      testID="screen-takeover"
    >
      {/* ---------------------------------------------------------------- 1. WHAT CHANGED */}
      <Text style={[st.eyebrow, { color: palette.fire }]}>◆ What changed</Text>
      {decision.messages !== undefined && decision.messages.length > 0 ? (
        <Text style={[st.lede, { color: palette.text }]}>{decision.messages[0]}</Text>
      ) : (
        <Text style={[st.lede, { color: palette.text }]}>Your signals moved today.</Text>
      )}

      <View style={st.chips}>
        {evidence.slice(0, 3).map((line) => (
          <Pill key={line} text={line} tone="fire" />
        ))}
      </View>

      {/* ------------------------------------------------------------- 2. WHAT I'M DOING */}
      <Text style={[st.eyebrow, { color: palette.textMuted, marginTop: space.xl }]}>
        What I'm doing
      </Text>

      <View style={[st.plan, { borderColor: palette.border, backgroundColor: palette.surface }]}>
        {/* The strikethrough on the user's own plan. Load-bearing — do not replace this with
            a generic "we suggest" card. */}
        <Text style={[st.struck, { color: palette.strike }]}>{activity.planned ?? "your session"}</Text>
        <Text style={[st.arrow, { color: palette.textMuted }]}>↓</Text>
        <Text style={[st.replacement, { color: palette.text }]}>
          {activity.prescribed ?? "rest"}
        </Text>
        {activity.location !== null && activity.location !== undefined && (
          <Text style={[st.where, { color: palette.textMuted }]}>{activity.location}</Text>
        )}
      </View>

      {decision.supplements.length > 0 && (
        <Text style={[st.aside, { color: palette.textMuted }]}>
          Plus {decision.supplements.join(", ")}.
        </Text>
      )}

      {/* Mandatory on every recommendation. One tap, never buried. */}
      <Pressable onPress={onWhyThis} accessibilityRole="button" testID="why-this">
        <Text style={[st.why, { color: palette.fire }]}>ⓘ  Why this?</Text>
      </Pressable>

      {decision.warnings !== undefined &&
        decision.warnings.map((warning) => <EngineWarning key={warning} text={warning} />)}

      {/* ------------------------------------------------------------------- 3. ACTIONS */}
      <View style={st.actions}>
        <Pressable
          style={[st.primary, { backgroundColor: palette.fire }]}
          accessibilityRole="button"
          onPress={onDismiss}
        >
          <Text style={st.primaryText}>Do it now</Text>
        </Pressable>
        <Pressable
          style={[st.secondary, { borderColor: palette.border }]}
          accessibilityRole="button"
          onPress={onDismiss}
        >
          <Text style={[st.secondaryText, { color: palette.text }]}>See my food</Text>
        </Pressable>
        <View style={st.tertiary}>
          <Text style={[st.tertiaryText, { color: palette.textMuted }]} onPress={onDismiss}>
            Later
          </Text>
          {/* Always present, always this far away, never de-emphasised on a repeat showing. */}
          <Text style={[st.tertiaryText, { color: palette.textMuted }]} onPress={onDismiss}>
            Not for me
          </Text>
        </View>
      </View>

      <Disclaimer />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  page: { padding: space.lg, paddingTop: space.xl * 2, paddingBottom: space.xl },
  eyebrow: { fontSize: type.caption, letterSpacing: 1.2, textTransform: "uppercase" },
  lede: { fontSize: type.title, lineHeight: type.title * 1.35, marginTop: space.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.md },
  plan: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
    marginTop: space.sm,
    alignItems: "flex-start",
  },
  struck: { fontSize: type.body, textDecorationLine: "line-through" },
  arrow: { fontSize: type.body, marginVertical: space.xs },
  replacement: { fontSize: type.title },
  where: { fontSize: type.caption, marginTop: space.xs },
  aside: { fontSize: type.label, marginTop: space.sm },
  why: { fontSize: type.body, marginTop: space.md },
  actions: { marginTop: space.xl, gap: space.sm },
  primary: { borderRadius: radius.md, paddingVertical: space.md, alignItems: "center" },
  primaryText: { color: "#FFFFFF", fontSize: type.body },
  secondary: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: space.md,
    alignItems: "center",
  },
  secondaryText: { fontSize: type.body },
  tertiary: { flexDirection: "row", justifyContent: "space-between", paddingTop: space.sm },
  tertiaryText: { fontSize: type.label },
});
