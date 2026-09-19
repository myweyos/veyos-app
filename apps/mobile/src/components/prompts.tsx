/**
 * Quiet prompts under Today's decision (SCRUM-97, SCRUM-99).
 *
 * Both are skippable and neither interrupts: no modal, no badge, no notification. They sit
 * below the plan and disappear on their own — the waist one when a measurement is recorded,
 * the T2 one when every question is answered. A user who never touches them loses nothing.
 */
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { api, type Me, type T2View } from "../lib/api";
import { color, radius } from "../theme/tokens";

export function TodayPrompts({ me }: { me: Me | null }) {
  const [t2, setT2] = useState<T2View | null>(null);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void api.t2().then(
        (v) => {
          if (live) setT2(v);
        },
        () => undefined,
      );
      return () => {
        live = false;
      };
    }, []),
  );

  const waistDue = me?.waist.due === true;
  const t2Open = t2 !== null && t2.unlocked && t2.answered < t2.total;
  if (!waistDue && !t2Open) return null;

  return (
    <View style={s.wrap}>
      {waistDue && (
        <Prompt
          title="A month on — your waist?"
          body={me?.waist.last_measured_on === null ? "One measurement, once a month. Kept as a number, never judged." : "Same tape, same place. Takes a minute."}
          onPress={() => router.push("/waist")}
        />
      )}
      {t2Open && t2 !== null && (
        <Prompt
          title="A few more questions, when you have a moment"
          body={
            t2.answered === 0
              ? "About how you eat and live. Answer any, in any order."
              : `${t2.answered} of ${t2.total} answered. Pick up where you left off.`
          }
          onPress={() => router.push("/t2")}
        />
      )}
    </View>
  );
}

function Prompt({ title, body, onPress }: { title: string; body: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={s.card}>
      <Text style={s.title}>{title}</Text>
      <Text style={s.body}>{body}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 10, marginTop: 18 },
  card: {
    backgroundColor: color.surface2,
    borderRadius: radius.note,
    padding: 14,
  },
  title: { fontSize: 14.5, fontWeight: "600", color: color.ink },
  body: { fontSize: 13.5, lineHeight: 19, color: color.muted, marginTop: 3 },
});
