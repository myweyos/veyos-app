/**
 * Dev harness for the Stage 1 screens.
 *
 * NOT a product surface. A scenario switcher so screens can be reviewed against real engine
 * output without a phone, a wearable or a backend. Phase 9 puts demo controls behind a build
 * flag with a test that fails if any is reachable in a production build — hard constraint 12:
 * no fake interventions in a production build.
 *
 * The full designed set (59 surfaces) lives in docs/design/Weyos_MVP_All_Screens_v0.5.html
 * and is openable in a browser directly. What is ported to React Native so far is B1–B6,
 * C2 and C3.
 */

import { useState } from "react";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

import { type PersonaId, dayCount, getDemoDay } from "@weyos/demo-fixtures";

import { Takeover } from "../src/screens/Takeover";
import { Today } from "../src/screens/Today";
import { Trace } from "../src/screens/Trace";
import { STATE_PRESENTATION, color } from "../src/theme/tokens";

const PERSONAS: PersonaId[] = ["sarah", "james", "alex"];
type Route = "today" | "takeover" | "trace";

export default function Home() {
  const [persona, setPersona] = useState<PersonaId>("sarah");
  const [dayIndex, setDayIndex] = useState(1);
  const [route, setRoute] = useState<Route>("today");

  const total = dayCount(persona);
  const index = Math.min(dayIndex, total - 1);
  const day = getDemoDay(persona, index);

  const pick = (p: PersonaId) => {
    setPersona(p);
    setDayIndex(0);
    setRoute("today");
  };

  return (
    <SafeAreaView style={s.root}>
      <View style={s.bar}>
        <Text style={s.barLabel}>DEMO · FIXTURE DATA</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.row}>
          {PERSONAS.map((p) => (
            <Pressable key={p} onPress={() => pick(p)} style={s.tab}>
              <Text style={[s.tabText, p === persona && s.tabOn]}>{p}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.row}>
          {Array.from({ length: total }, (_, i) => {
            const d = getDemoDay(persona, i);
            return (
              <Pressable
                key={i}
                onPress={() => {
                  setDayIndex(i);
                  setRoute("today");
                }}
                style={s.tab}
              >
                <Text style={[s.tabText, i === index && s.tabOn]}>
                  {STATE_PRESENTATION[d.app_state].glyph} {i}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Text style={s.caption} numberOfLines={2}>
          {day.label}
        </Text>
      </View>

      {route === "today" && (
        <Today
          day={day}
          onWhyThis={() => setRoute("trace")}
          onTakeover={() => setRoute("takeover")}
        />
      )}
      {route === "takeover" && (
        <Takeover day={day} onWhyThis={() => setRoute("trace")} onDismiss={() => setRoute("today")} />
      )}
      {route === "trace" && <Trace day={day} onBack={() => setRoute("today")} />}

      {route === "today" && day.app_state === "intervention" && (
        <Pressable onPress={() => setRoute("takeover")} style={s.footer}>
          <Text style={s.footerText}>Open the takeover ›</Text>
        </Pressable>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.cream },
  bar: {
    borderBottomWidth: 1,
    borderBottomColor: color.line,
    backgroundColor: color.surface2,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  barLabel: { fontSize: 10, letterSpacing: 1.4, color: color.muted, fontWeight: "600" },
  row: { flexDirection: "row", marginTop: 4 },
  tab: { paddingVertical: 4, paddingRight: 16 },
  tabText: { fontSize: 14, color: color.muted },
  tabOn: { color: color.accent, fontWeight: "600" },
  caption: { fontSize: 12, color: color.muted, marginTop: 4 },
  footer: {
    padding: 14,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: color.line,
    backgroundColor: color.surface,
  },
  footerText: { color: color.accent, fontWeight: "600", fontSize: 14.5 },
});
