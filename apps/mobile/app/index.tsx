/**
 * Dev harness for the Stage 1 screens.
 *
 * NOT a product surface. This is a scenario switcher so the screens can be reviewed against
 * real engine output without a phone, a wearable or a backend. Phase 9 puts demo controls
 * behind a build flag with a test that fails if any of them is reachable in a production
 * build — hard constraint 12: no fake interventions in a production build.
 *
 * Every screen below renders a real Decision produced by config/rules/rules.v1.yaml through
 * the real engine, loaded from @weyos/demo-fixtures. Nothing here invents a data shape.
 */

import { useState } from "react";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

import { type PersonaId, dayCount, getDemoDay } from "@weyos/demo-fixtures";

import { Takeover } from "../src/screens/Takeover";
import { Today } from "../src/screens/Today";
import { Trace } from "../src/screens/Trace";
import { STATE_PRESENTATION, space, type } from "../src/theme/tokens";
import { useTheme } from "../src/theme/useTheme";

const PERSONAS: PersonaId[] = ["sarah", "james", "alex"];
type View3 = "today" | "takeover" | "trace";

export default function Home() {
  const palette = useTheme();
  const [persona, setPersona] = useState<PersonaId>("sarah");
  const [dayIndex, setDayIndex] = useState(1);
  const [view, setView] = useState<View3>("today");

  const total = dayCount(persona);
  const safeIndex = Math.min(dayIndex, total - 1);
  const day = getDemoDay(persona, safeIndex);

  const pick = (next: PersonaId) => {
    setPersona(next);
    setDayIndex(0);
    setView("today");
  };

  return (
    <SafeAreaView style={[st.root, { backgroundColor: palette.bg }]}>
      <View style={[st.bar, { borderColor: palette.border, backgroundColor: palette.surface }]}>
        <Text style={[st.barLabel, { color: palette.textMuted }]}>DEMO — fixture data</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.row}>
          {PERSONAS.map((p) => (
            <Pressable key={p} onPress={() => pick(p)} style={st.tab}>
              <Text
                style={[
                  st.tabText,
                  { color: p === persona ? palette.fire : palette.textMuted },
                ]}
              >
                {p}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.row}>
          {Array.from({ length: total }, (_, i) => {
            const d = getDemoDay(persona, i);
            const active = i === safeIndex;
            return (
              <Pressable
                key={i}
                onPress={() => {
                  setDayIndex(i);
                  setView("today");
                }}
                style={st.tab}
              >
                <Text style={[st.tabText, { color: active ? palette.fire : palette.textMuted }]}>
                  {STATE_PRESENTATION[d.app_state].glyph} {i}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Text style={[st.caption, { color: palette.textMuted }]} numberOfLines={2}>
          {day.label}
        </Text>
      </View>

      {view === "today" && <Today day={day} onOpenTakeover={() => setView("takeover")} />}
      {view === "takeover" && (
        <Takeover day={day} onWhyThis={() => setView("trace")} onDismiss={() => setView("today")} />
      )}
      {view === "trace" && <Trace day={day} onBack={() => setView("today")} />}

      {view === "today" && day.app_state !== "intervention" && (
        <Pressable onPress={() => setView("trace")} style={st.footer}>
          <Text style={[st.caption, { color: palette.textMuted }]}>Why this? →</Text>
        </Pressable>
      )}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },
  bar: { borderBottomWidth: 1, paddingHorizontal: space.md, paddingVertical: space.sm },
  barLabel: { fontSize: 10, letterSpacing: 1.4 },
  row: { flexDirection: "row", marginTop: space.xs },
  tab: { paddingVertical: space.xs, paddingRight: space.md },
  tabText: { fontSize: type.label },
  caption: { fontSize: type.caption, marginTop: space.xs },
  footer: { padding: space.md, alignItems: "center" },
});
