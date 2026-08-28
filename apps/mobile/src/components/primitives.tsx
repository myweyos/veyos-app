/**
 * Shared primitives.
 *
 * NOT the approved component inventory — spec §5.7 is not in this repo, and its prose says
 * 22 components while listing 23. These are the minimum needed by the three screens
 * Appendix A calls "the screens that carry the product". See DESIGN-DEBT.md.
 *
 * Two hard constraints are enforced here rather than left to reviewers:
 *   - State is never colour alone: `StateHeader` always renders glyph + word + colour.
 *   - Every recommendation surface carries the wellness disclaimer.
 */

import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { type AppStateId, STATE_PRESENTATION, WELLNESS_DISCLAIMER, radius, space, toneColor, type } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

export function StateHeader({ state, line }: { state: AppStateId; line: string }) {
  const palette = useTheme();
  const presentation = STATE_PRESENTATION[state];
  const accent = toneColor(presentation.tone, palette);

  return (
    <View style={s.header}>
      <View style={s.headerRow}>
        {/* Glyph AND word AND colour — never colour alone. */}
        <Text style={[s.glyph, { color: accent }]}>{presentation.glyph}</Text>
        <Text style={[s.word, { color: accent }]}>{presentation.word}</Text>
      </View>
      <Text style={[s.headline, { color: palette.text }]}>{line}</Text>
    </View>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  const palette = useTheme();
  return (
    <View style={s.section}>
      <Text style={[s.sectionTitle, { color: palette.textMuted }]}>{title}</Text>
      {children}
    </View>
  );
}

export function Card({ children }: { children: ReactNode }) {
  const palette = useTheme();
  return (
    <View style={[s.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      {children}
    </View>
  );
}

/**
 * A signal tile.
 *
 * `value` is deliberately allowed to be null. Hard constraint 2: never fake certainty, never
 * render 0ms or a dash or a flat line for missing data. An absent reading says so in words.
 */
export function SignalTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | null;
  detail?: string;
}) {
  const palette = useTheme();
  const unknown = value === null;
  return (
    <View style={[s.tile, { borderColor: palette.border, backgroundColor: palette.surface }]}>
      <Text style={[s.tileLabel, { color: palette.textMuted }]}>{label}</Text>
      <Text style={[s.tileValue, { color: unknown ? palette.textMuted : palette.text }]}>
        {unknown ? "Not available" : value}
      </Text>
      {detail !== undefined && (
        <Text style={[s.tileDetail, { color: palette.textMuted }]}>{detail}</Text>
      )}
    </View>
  );
}

export function Pill({ text, tone }: { text: string; tone?: string }) {
  const palette = useTheme();
  const accent = tone === undefined ? palette.textMuted : toneColor(tone, palette);
  return (
    <View style={[s.pill, { borderColor: accent }]}>
      <Text style={[s.pillText, { color: accent }]}>{text}</Text>
    </View>
  );
}

/** Hard constraint 11. Present on every recommendation surface. */
export function Disclaimer({ extra }: { extra?: string }) {
  const palette = useTheme();
  return (
    <View style={s.disclaimer}>
      <Text style={[s.disclaimerText, { color: palette.textMuted }]}>{WELLNESS_DISCLAIMER}</Text>
      {extra !== undefined && (
        <Text style={[s.disclaimerText, { color: palette.textMuted }]}>{extra}</Text>
      )}
    </View>
  );
}

/**
 * A warning the engine raised.
 *
 * Rendered plainly and never suppressed. The ginger-for-a-Pitta collision is the case that
 * matters: L1 outranks L3 so the item stays, and the disagreement is SHOWN rather than
 * quietly resolved. Filtering these to make a screen look clean would defeat the point.
 */
export function EngineWarning({ text }: { text: string }) {
  const palette = useTheme();
  return (
    <View style={[s.warning, { borderColor: palette.fire, backgroundColor: palette.surface }]}>
      <Text style={[s.warningText, { color: palette.text }]}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  header: { marginBottom: space.lg },
  headerRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  glyph: { fontSize: type.title },
  word: { fontSize: type.label, letterSpacing: 1, textTransform: "uppercase" },
  headline: { fontSize: type.display, marginTop: space.sm, lineHeight: type.display * 1.25 },
  section: { marginBottom: space.lg },
  sectionTitle: {
    fontSize: type.caption,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: space.sm,
  },
  card: { borderWidth: 1, borderRadius: radius.md, padding: space.md },
  tile: {
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: space.sm,
    minWidth: 108,
    flexGrow: 1,
  },
  tileLabel: { fontSize: type.caption, letterSpacing: 0.6, textTransform: "uppercase" },
  tileValue: { fontSize: type.title, marginTop: space.xs },
  tileDetail: { fontSize: type.caption, marginTop: space.xs },
  pill: {
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  pillText: { fontSize: type.caption },
  disclaimer: { marginTop: space.lg },
  disclaimerText: { fontSize: type.caption, lineHeight: type.caption * 1.5 },
  warning: {
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: radius.sm,
    padding: space.md,
    marginTop: space.sm,
  },
  warningText: { fontSize: type.label, lineHeight: type.label * 1.45 },
});
