/**
 * C2 — the intervention takeover. The product lives or dies here.
 *
 * Evidence before instruction. The user's own plan visibly struck through. "Not for me"
 * always present at the same distance. One takeover a day, hard-capped.
 *
 * No red, no siren iconography. Intervention is Fire (accent); `danger` is reserved for
 * destructive account actions.
 */

import { ScrollView, StyleSheet, Text, View } from "react-native";

import type { DemoDay } from "@weyos/demo-fixtures";

import { Button, Chip, Disclaimer, Link, Section, WarnBox } from "../components/primitives";
import { color, space, type } from "../theme/tokens";

export function Takeover({
  day,
  onWhyThis,
  onDismiss,
}: {
  day: DemoDay;
  onWhyThis: () => void;
  onDismiss: () => void;
}) {
  const decision = day.decision;
  const activity = decision.activity;
  const evidence = decision.fired_rules.flatMap((r) => r.because ?? []);
  const messages = decision.messages ?? [];
  const warnings = decision.warnings ?? [];

  return (
    <ScrollView style={s.page} contentContainerStyle={s.content} testID="screen-takeover">
      {/* 1. WHAT CHANGED — evidence first. */}
      <Section title="What changed">
        <Text style={s.what}>
          {messages[0] ?? "Your live signals moved today."}
        </Text>
        <View style={s.chips}>
          {evidence.slice(0, 3).map((e) => (
            <Chip key={e} text={e} tone="calm" />
          ))}
        </View>
      </Section>

      {/* 2. WHAT I'M DOING — the strikethrough is load-bearing. The user must see THEIR OWN
          plan being changed, not a generic suggestion appearing. */}
      <Section title="What I'm doing">
        <View style={s.planrow}>
          <Text style={s.time}>{activity.location ?? ""}</Text>
          <Text style={s.strike}>{activity.planned ?? "your session"}</Text>
        </View>
        <View style={s.planrow}>
          <Text style={s.arrow}>→</Text>
          <Text style={s.to}>{activity.prescribed ?? "rest"}</Text>
        </View>
        {decision.supplements.length > 0 && (
          <Text style={s.plus}>+ {decision.supplements.join(", ")}</Text>
        )}
        <Link text="ⓘ  Why this?" onPress={onWhyThis} />
      </Section>

      {warnings.map((w) => (
        <WarnBox key={w} text={w} />
      ))}

      {/* 3. ACTIONS — thumb zone. "Not for me" never hidden, never smaller on a repeat. */}
      <View style={s.actions}>
        <Button label="Do it now" kind="primary" onPress={onDismiss} />
        <Button label="See my food" kind="secondary" onPress={onDismiss} />
        <View style={s.tertiary}>
          <Button label="Later" kind="quiet" onPress={onDismiss} />
          <Button label="Not for me" kind="quiet" onPress={onDismiss} />
        </View>
      </View>

      <Disclaimer />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { backgroundColor: color.cream },
  content: { paddingHorizontal: 20, paddingBottom: 60, paddingTop: space.lg },
  what: { fontSize: type.title.size, lineHeight: type.title.size * 1.25, color: color.ink },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: space.md },
  planrow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: color.line,
  },
  time: { fontSize: 13, color: color.muted, width: 66 },
  strike: { fontSize: 15.5, color: color.muted, textDecorationLine: "line-through", flex: 1 },
  arrow: { color: color.accent, fontWeight: "700", width: 66, fontSize: 15.5 },
  to: { fontSize: 15.5, color: color.ink, fontWeight: "600", flex: 1 },
  plus: { fontSize: 14, color: color.muted, marginTop: 10 },
  actions: { marginTop: space.xl },
  tertiary: { flexDirection: "row", justifyContent: "space-between", marginTop: space.sm },
});
