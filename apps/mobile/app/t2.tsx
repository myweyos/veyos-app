/**
 * T2 — the week-one re-entry surface (SCRUM-97, SCRUM-98).
 *
 * Unlocks a week after the account is created. No notification asks for it; Today shows a
 * quiet card once it's open. Each answer is saved as it's given, so the surface is resumable
 * and partial completion is a normal state. It is not a takeover and doesn't count against
 * the one-takeover-a-day cap.
 */
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { Back, Busy, Caption, ErrorLine, Screen, Sub, Title } from "../src/components/form";
import { Button } from "../src/components/primitives";
import { api, type T2Answer, type T2Item, type T2View } from "../src/lib/api";
import { color, radius } from "../src/theme/tokens";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export default function T2Route() {
  const [items, setItems] = useState<T2Item[] | null>(null);
  const [view, setView] = useState<T2View | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([api.t2Instrument(), api.t2()]).then(
      ([instrument, current]) => {
        setItems(instrument.items);
        setView(current);
      },
      () => setError("Couldn’t load these questions right now."),
    );
  }, []);

  const save = async (id: string, value: T2Answer) => {
    setError(null);
    try {
      setView(await api.saveT2({ [id]: value }));
    } catch {
      setError("Couldn’t save that answer. It’ll still be here when you come back.");
    }
  };

  if (items === null || view === null) {
    return (
      <Screen>
        <ErrorLine text={error} />
        <Busy />
      </Screen>
    );
  }

  if (!view.unlocked) {
    return (
      <Screen>
        <Back onPress={() => router.back()} />
        <Title text="A few more questions, after your first week" />
        <Sub text={`These open ${view.unlocks_on ?? "soon"}. Nothing here is needed before then.`} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Back onPress={() => router.back()} />
      <Title text="A little more about how you live" />
      <Sub text="Answer what you like, in any order, and come back any time. Every answer is saved as you go." />
      <Caption text={`${view.answered} of ${view.total} answered`} />
      {items.map((item) => {
        const current = view.answers[item.id];
        return (
          <View key={item.id} style={s.q}>
            <Text style={s.text}>{item.question}</Text>
            {item.type === "time" ? (
              <View style={s.row}>
                <TextInput
                  value={drafts[item.id] ?? (typeof current === "string" ? current : "")}
                  onChangeText={(t) => setDrafts((d) => ({ ...d, [item.id]: t }))}
                  onBlur={() => {
                    const t = (drafts[item.id] ?? "").trim();
                    if (TIME.test(t)) void save(item.id, t);
                  }}
                  placeholder="08:00"
                  placeholderTextColor={color.muted2}
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                  style={s.time}
                  accessibilityLabel={item.question}
                />
                <Caption text="HH:MM" />
              </View>
            ) : (
              (item.options ?? []).map((option, i) => {
                const n = i + 1;
                const selected = Array.isArray(current) ? current.includes(n) : current === n;
                const onPress = () => {
                  if (item.type !== "multi") {
                    void save(item.id, n);
                    return;
                  }
                  const exclusive = item.exclusive_option === undefined ? -1 : (item.options ?? []).indexOf(item.exclusive_option) + 1;
                  const prev = Array.isArray(current) ? current : [];
                  let next: number[];
                  if (n === exclusive) next = selected ? [] : [n];
                  else next = (selected ? prev.filter((x) => x !== n) : [...prev, n]).filter((x) => x !== exclusive);
                  if (next.length > 0) void save(item.id, next);
                };
                return (
                  <Pressable
                    key={option}
                    accessibilityRole={item.type === "multi" ? "checkbox" : "radio"}
                    accessibilityState={item.type === "multi" ? { checked: selected } : { selected }}
                    onPress={onPress}
                    style={[s.opt, selected && s.optOn]}
                  >
                    <View style={[s.dot, item.type === "multi" && s.box, selected && s.dotOn]} />
                    <Text style={s.optText}>{option}</Text>
                  </Pressable>
                );
              })
            )}
          </View>
        );
      })}
      <ErrorLine text={error} />
      <Button label="Done for now" kind="primary" onPress={() => router.back()} />
    </Screen>
  );
}

const s = StyleSheet.create({
  q: { paddingVertical: 18, borderTopWidth: 1, borderTopColor: color.line },
  text: { fontSize: 17, lineHeight: 24, color: color.ink, marginBottom: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  time: {
    fontSize: 16,
    color: color.ink,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.note,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 110,
    backgroundColor: color.surface,
  },
  opt: { flexDirection: "row", alignItems: "flex-start", gap: 11, padding: 10, borderRadius: 8 },
  optOn: { backgroundColor: color.surface2 },
  optText: { flex: 1, fontSize: 15, lineHeight: 22, color: color.ink },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: color.muted2, marginTop: 3 },
  box: { borderRadius: 4 },
  dotOn: { borderColor: color.accent, backgroundColor: color.accent },
});
