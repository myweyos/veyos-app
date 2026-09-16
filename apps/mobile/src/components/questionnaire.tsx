/**
 * Module J question widgets (SCRUM-89): five-option lists, anchored 1–5 scales, and the
 * time-or-none dip question. Styled from the advisory pack's questionnaire page.
 */
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import type { InstrumentItem } from "../lib/api";
import { color, radius } from "../theme/tokens";

export function OptionsQuestion({
  item,
  value,
  onChange,
}: {
  item: InstrumentItem;
  value: number | undefined;
  onChange: (v: number) => void;
}) {
  return (
    <View style={s.q}>
      <Text style={s.text}>{item.question}</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={item.question}>
        {(item.options ?? []).map((option, i) => {
          const on = value === i + 1;
          return (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              onPress={() => onChange(i + 1)}
              style={[s.opt, on && s.optOn]}
            >
              <View style={[s.dot, on && s.dotOn]} />
              <Text style={s.optText}>{option}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function ScaleQuestion({
  item,
  value,
  onChange,
}: {
  item: InstrumentItem;
  value: number | undefined;
  onChange: (v: number) => void;
}) {
  return (
    <View style={s.q}>
      <Text style={s.text}>{item.question}</Text>
      <View style={s.scaleRow} accessibilityRole="radiogroup" accessibilityLabel={item.question}>
        {[1, 2, 3, 4, 5].map((n) => {
          const on = value === n;
          return (
            <Pressable
              key={n}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${n} of 5`}
              onPress={() => onChange(n)}
              style={[s.cell, on && s.cellOn]}
            >
              <Text style={[s.cellText, on && s.cellTextOn]}>{n}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={s.anchors}>
        <Text style={s.anchor}>{item.low}</Text>
        <Text style={[s.anchor, s.anchorRight]}>{item.high}</Text>
      </View>
    </View>
  );
}

/** "Is there a time of day your energy reliably drops?" A time, or none. */
export function DipQuestion({
  item,
  value,
  onChange,
}: {
  item: InstrumentItem;
  value: string | null | undefined; // "HH:MM", null = no consistent dip, undefined = unanswered
  onChange: (v: string | null) => void;
}) {
  const none = value === null;
  return (
    <View style={s.q}>
      <Text style={s.text}>{item.question}</Text>
      <View style={s.dipRow}>
        <TextInput
          value={none ? "" : (value ?? "")}
          onChangeText={(t) => onChange(t)}
          placeholder="13:00"
          placeholderTextColor={color.muted2}
          keyboardType="numbers-and-punctuation"
          editable={!none}
          accessibilityLabel="Time of day your energy drops"
          style={[s.time, none && s.timeOff]}
          maxLength={5}
        />
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: none }}
          onPress={() => onChange(none ? "" : null)}
          style={[s.opt, none && s.optOn, s.noneOpt]}
        >
          <View style={[s.dot, none && s.dotOn]} />
          <Text style={s.optText}>{item.none_label ?? "No consistent dip"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  q: { paddingVertical: 20, borderTopWidth: 1, borderTopColor: color.line },
  text: { fontSize: 18, lineHeight: 25, color: color.ink, marginBottom: 12 },
  opt: { flexDirection: "row", alignItems: "flex-start", gap: 11, padding: 10, borderRadius: 8 },
  optOn: { backgroundColor: color.surface2 },
  optText: { flex: 1, fontSize: 15, lineHeight: 22, color: color.ink },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: color.muted2, marginTop: 3 },
  dotOn: { borderColor: color.accent, backgroundColor: color.accent },
  scaleRow: { flexDirection: "row", gap: 6 },
  cell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.note,
    backgroundColor: color.surface,
  },
  cellOn: { backgroundColor: color.accent, borderColor: color.accent },
  cellText: { fontSize: 14, color: color.muted },
  cellTextOn: { color: color.surface, fontWeight: "600" },
  anchors: { flexDirection: "row", justifyContent: "space-between", gap: 16, marginTop: 8 },
  anchor: { fontSize: 12.5, color: color.muted, flex: 1 },
  anchorRight: { textAlign: "right" },
  dipRow: { flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" },
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
  timeOff: { opacity: 0.4 },
  noneOpt: { flex: 1 },
});
