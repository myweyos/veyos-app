/**
 * Onboarding building blocks, styled from the design pack's shared screen CSS (`.title`,
 * `.sub`, `.card.tap`, `.togrow`, `.stepdots`, `.back`). Used by the A-section screens.
 */
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";

import { color, column, radius, type } from "../theme/tokens";

export function Screen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={s.root}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export const Title = ({ text }: { text: string }) => <Text style={s.title}>{text}</Text>;
export const Sub = ({ text }: { text: string }) => <Text style={s.sub}>{text}</Text>;
export const Body = ({ children }: { children: ReactNode }) => <Text style={s.body}>{children}</Text>;
export const Caption = ({ text }: { text: string }) => <Text style={s.caption}>{text}</Text>;

export function Field(props: TextInputProps & { label: string }) {
  const { label, ...input } = props;
  return (
    <View style={s.card}>
      <Text style={s.cap}>{label}</Text>
      <TextInput placeholderTextColor={color.muted2} style={s.input} {...input} />
    </View>
  );
}

/** `.card.tap` with a selected state, for single-choice questions (A3, A7). */
export function Choice({
  title,
  detail,
  selected,
  onPress,
}: {
  title: string;
  detail?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[s.card, s.choice, selected && s.choiceOn]}
    >
      <View style={s.choiceText}>
        <Text style={s.choiceTitle}>{title}</Text>
        {detail !== undefined && <Text style={s.cap}>{detail}</Text>}
      </View>
      <Text style={[s.chip, selected && s.chipOn]}>{selected ? "Selected" : "Select"}</Text>
    </Pressable>
  );
}

/** `.togrow`: one consent or setting, with its consequence line. */
export function ToggleRow({
  title,
  detail,
  value,
  onChange,
  locked,
}: {
  title: string;
  detail: string;
  value: boolean;
  onChange?: (v: boolean) => void;
  locked?: boolean;
}) {
  return (
    <View style={s.togrow}>
      <View style={s.choiceText}>
        <Text style={s.tn}>{title}</Text>
        <Text style={s.td}>{detail}</Text>
      </View>
      <Switch
        value={value}
        disabled={locked === true || onChange === undefined}
        onValueChange={onChange}
        trackColor={{ true: color.accent, false: color.line }}
        accessibilityLabel={title}
      />
    </View>
  );
}

export function StepDots({ step, of }: { step: number; of: number }) {
  return (
    <View style={s.dots} accessibilityLabel={`Step ${step} of ${of}`}>
      {Array.from({ length: of }, (_, i) => (
        <View key={i} style={[s.dot, i < step && s.dotOn]} />
      ))}
    </View>
  );
}

export function Back({ onPress }: { onPress: () => void }) {
  return (
    <Text accessibilityRole="button" onPress={onPress} style={s.back}>
      ‹ Back
    </Text>
  );
}

export function ErrorLine({ text }: { text: string | null }) {
  return text === null ? null : <Text style={s.error}>{text}</Text>;
}

export function Busy() {
  return <ActivityIndicator color={color.accent} style={s.busy} />;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.cream },
  content: { ...column, paddingHorizontal: 22, paddingTop: 24, paddingBottom: 48 },
  title: {
    fontSize: type.title.size,
    lineHeight: type.title.size * type.title.line,
    fontWeight: type.title.weight,
    letterSpacing: type.title.spacing,
    color: color.ink,
    marginTop: 24,
  },
  sub: { fontSize: type.sub.size, lineHeight: type.sub.size * type.sub.line, color: color.muted, marginTop: 8, marginBottom: 14 },
  body: { fontSize: type.body.size, lineHeight: type.body.size * type.body.line, color: color.ink, marginVertical: 10 },
  caption: { fontSize: type.caption.size, lineHeight: type.caption.size * type.caption.line, color: color.muted, marginTop: 14 },
  cap: { fontSize: type.caption.size, color: color.muted, marginTop: 2 },
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.line,
    padding: 16,
    marginBottom: 10,
  },
  input: { fontSize: 16, color: color.ink, paddingVertical: 6, marginTop: 4 },
  choice: { flexDirection: "row", alignItems: "center" },
  choiceOn: { borderColor: color.accent },
  choiceText: { flex: 1, paddingRight: 12 },
  choiceTitle: { fontSize: 15.5, fontWeight: "600", color: color.ink },
  chip: {
    fontSize: 12.5,
    color: color.muted,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    overflow: "hidden",
  },
  chipOn: { color: color.surface, backgroundColor: color.accent, borderColor: color.accent },
  togrow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: color.line,
  },
  tn: { fontSize: 14.5, fontWeight: "600", color: color.ink },
  td: { fontSize: 12.5, lineHeight: 18, color: color.muted, marginTop: 2 },
  dots: { flexDirection: "row", gap: 6, marginVertical: 18 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: color.line },
  dotOn: { backgroundColor: color.accent },
  back: { color: color.muted, fontSize: 14, marginTop: 16 },
  error: { color: color.danger, fontSize: 13.5, marginTop: 10 },
  busy: { marginVertical: 16 },
});
