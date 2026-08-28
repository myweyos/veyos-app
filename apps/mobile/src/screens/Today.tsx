/**
 * B1–B6 — Today.
 *
 * The app should mostly say nothing (design principle 1). Home is one sentence and a colour.
 * No charts, no streaks, no engagement nudges, nothing that rewards opening the app.
 *
 * One deliberate exception: the signal tiles sit beneath the headline in EVERY state,
 * including "in balance". That is the agreed mitigation for the James gap — a user whose
 * RHR is visibly elevated sees the number even on a day when no rule fired and the app says
 * nothing is wrong. It does not fix F5; it stops the screen hiding it.
 */

import { ScrollView, StyleSheet, Text, View } from "react-native";

import type { DemoDay } from "@weyos/demo-fixtures";

import { Disclaimer, EngineWarning, Section, SignalTile, StateHeader } from "../components/primitives";
import { space, type } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";
import { headlineFor, signalTilesFor } from "./copy";

export function Today({ day, onOpenTakeover }: { day: DemoDay; onOpenTakeover: () => void }) {
  const palette = useTheme();
  const decision = day.decision;
  const tiles = signalTilesFor(day);

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={st.page}
      testID="screen-today"
    >
      <StateHeader state={day.app_state} line={headlineFor(day)} />

      {/* Always visible, in every state. See the module docstring. */}
      <Section title="What I'm reading">
        <View style={st.tiles}>
          {tiles.map((tile) => (
            <SignalTile key={tile.label} label={tile.label} value={tile.value} detail={tile.detail} />
          ))}
        </View>
      </Section>

      {day.app_state === "intervention" && (
        <Section title="Today">
          <Text style={[st.link, { color: palette.fire }]} onPress={onOpenTakeover}>
            See what changed →
          </Text>
        </Section>
      )}

      {decision.messages !== undefined && decision.messages.length > 0 && (
        <Section title="Notes">
          {decision.messages.map((message) => (
            <Text key={message} style={[st.message, { color: palette.text }]}>
              {message}
            </Text>
          ))}
        </Section>
      )}

      {decision.warnings !== undefined && decision.warnings.length > 0 && (
        <Section title="Worth knowing">
          {decision.warnings.map((warning) => (
            <EngineWarning key={warning} text={warning} />
          ))}
        </Section>
      )}

      <Disclaimer />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  page: { padding: space.lg, paddingTop: space.xl * 2, paddingBottom: space.xl },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  message: { fontSize: type.body, lineHeight: type.body * 1.5, marginBottom: space.sm },
  link: { fontSize: type.body },
});
