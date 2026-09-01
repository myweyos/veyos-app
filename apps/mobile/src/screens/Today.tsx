/**
 * B1–B6 — Today, one screen with several states.
 *
 * The distinction the pack cares about most: Calibrating and Partial must look visibly
 * different from In balance, because "I could not evaluate" must never look like "you are
 * fine". That is what three-valued evaluation buys, and it is the whole reason the state has
 * its own glyph, its own word and its own copy.
 *
 * Signal tiles sit under the verdict in every state, including In balance — so a user whose
 * resting heart rate is visibly elevated sees the number even on a day when no rule fired.
 */

import { ScrollView, StyleSheet, View } from "react-native";

import type { DemoDay } from "@weyos/demo-fixtures";

import {
  Card,
  DateLine,
  Disclaimer,
  Link,
  Note,
  Section,
  SignalTile,
  Tiles,
  Verdict,
  WarnBox,
} from "../components/primitives";
import { color, space } from "../theme/tokens";
import { headlineFor, signalTilesFor, subFor } from "./copy";

export function Today({ day, onOpen }: { day: DemoDay; onOpen: () => void }) {
  const decision = day.decision;
  const tiles = signalTilesFor(day);
  const messages = decision.messages ?? [];
  const warnings = decision.warnings ?? [];

  return (
    <ScrollView style={s.page} contentContainerStyle={s.content} testID="screen-today">
      <DateLine text={decision.as_of} />
      <Verdict state={day.app_state} headline={headlineFor(day)} sub={subFor(day)} />

      <Tiles>
        {tiles.map((t) => (
          <SignalTile
            key={t.label}
            label={t.label}
            value={t.value}
            unit={t.unit}
            detail={t.detail}
            pillar={t.pillar}
            unknown={t.unknown}
          />
        ))}
      </Tiles>

      {messages.length > 0 && (
        <Section title="Tonight">
          <Card>
            {messages.map((m) => (
              <Note key={m} text={m} />
            ))}
          </Card>
        </Section>
      )}

      {warnings.length > 0 && (
        <Section title="Worth knowing">
          {warnings.map((w) => (
            <WarnBox key={w} text={w} />
          ))}
        </Section>
      )}

      <View>
        <Link text="Why this? ›" onPress={onOpen} />
      </View>

      <Disclaimer />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { backgroundColor: color.cream },
  content: { paddingHorizontal: 20, paddingBottom: 60, paddingTop: space.sm },
});
