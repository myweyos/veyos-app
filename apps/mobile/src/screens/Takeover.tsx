/**
 * C2 — the takeover. Ported from the design pack.
 *
 * "Evidence, then instruction, then actions. The order is not negotiable."
 *
 *   kicker → what changed → evidence chips → the swap → Why this? → actions
 *
 * The swap uses the same 66px time column top and bottom, so the struck plan and its
 * replacement line up vertically with the arrow between them. That alignment is what makes
 * the change legible without reading a word.
 *
 * "Not for me" sits in the quiet row beside "Later" — always present, always the same
 * distance away, never smaller on a repeat showing. No red, no siren iconography.
 */

import { ScrollView, StyleSheet, Text, View } from "react-native";

import type { DemoDay } from "@weyos/demo-fixtures";

import { Button, Chip, Disclaimer, Link, WarnBox } from "../components/primitives";
import {
  ButtonRow,
  EvidenceRow,
  Kicker,
  PlanRow,
  Struck,
  Swap,
  SwapLabel,
  WhatChanged,
} from "../components/layout";
import { color, space } from "../theme/tokens";

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
  const at = activity.location ?? "";

  // Rest is not something you "do now". The pack changes the primary label for it.
  const primary = activity.verdict === "rest" ? "Alright, resting" : "Do it now";

  return (
    <ScrollView style={s.page} contentContainerStyle={s.content} testID="screen-takeover">
      <Kicker text="Something changed" />
      <WhatChanged text={messages[0] ?? "Your live signals moved today."} />

      <EvidenceRow>
        {evidence.slice(0, 3).map((e) => (
          <Chip key={e} text={e} tone="warm" />
        ))}
      </EvidenceRow>

      <Swap>
        <SwapLabel text="What I'm doing" />
        <PlanRow time={at} last>
          <Struck text={activity.planned ?? "your session"} />
        </PlanRow>
        <Text style={s.arrow}>↓</Text>
        <PlanRow time={at} last>
          <Text style={s.to}>{activity.prescribed ?? "rest"}</Text>
        </PlanRow>
        {decision.supplements.length > 0 && (
          <Text style={s.food}>+ {decision.supplements.join(", ")}</Text>
        )}
      </Swap>

      <Link text="ⓘ Why this?" onPress={onWhyThis} />

      {warnings.map((w) => (
        <WarnBox key={w} text={w} />
      ))}

      <View style={s.actions}>
        <Button label={primary} kind="primary" onPress={onDismiss} />
        <Button label="See my food" kind="secondary" onPress={onDismiss} />
        <ButtonRow>
          <View style={s.half}>
            <Button label="Later" kind="quiet" onPress={onDismiss} />
          </View>
          <View style={s.half}>
            <Button label="Not for me" kind="quiet" onPress={onDismiss} />
          </View>
        </ButtonRow>
      </View>

      <Disclaimer />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { backgroundColor: color.cream },
  content: { paddingHorizontal: 24, paddingBottom: 40, paddingTop: space.md },
  arrow: { color: color.accent, fontWeight: "700", paddingLeft: 78, fontSize: 15.5 },
  to: { fontSize: 15.5, fontWeight: "600", color: color.ink },
  food: { fontSize: 12.5, color: color.muted, marginTop: 8, paddingLeft: 78 },
  actions: { marginTop: 22 },
  half: { flex: 1 },
});
