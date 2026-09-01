/**
 * Primitives, ported from the design pack's shared screen styles.
 *
 * Each maps to a class in docs/design/Weyos_MVP_All_Screens_v0.5.html — `.verdict`,
 * `.tiles`/`.tile`, `.card`, `.chip`, `.trace`, `.warnbox`, `.note`, `.disclaim`, `.btn`.
 * Where the pack specifies a value, it is used verbatim rather than approximated.
 *
 * NOT yet the full §5.7 component inventory — that section is in the design spec document,
 * which is still not in the repo. See DESIGN-DEBT.md.
 *
 * Two constraints enforced here rather than left to reviewers:
 *   - State is never colour alone: `Verdict` always renders glyph + word + colour.
 *   - Every recommendation surface carries the wellness disclaimer.
 */

import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  type AppStateId,
  PILLAR,
  type PillarId,
  STATE_PRESENTATION,
  WELLNESS_DISCLAIMER,
  color,
  radius,
  space,
  type,
} from "../theme/tokens";

const font = (t: (typeof type)[keyof typeof type]) => ({
  fontSize: t.size,
  lineHeight: t.size * t.line,
  fontWeight: t.weight,
  letterSpacing: t.spacing,
});

/** `.h-date` — the quiet date line above the verdict. */
export function DateLine({ text }: { text: string }) {
  return <Text style={s.date}>{text}</Text>;
}

/**
 * `.verdict` — the one sentence Today is built around.
 *
 * Glyph carries the state colour; the headline stays ink. Never colour alone: the glyph
 * shape and the state word both differ, so the state survives colour-vision differences and
 * bright sunlight.
 */
export function Verdict({
  state,
  headline,
  sub,
}: {
  state: AppStateId;
  headline: string;
  sub?: string;
}) {
  const p = STATE_PRESENTATION[state];
  return (
    <View>
      <Text style={s.verdict}>
        <Text style={[s.glyph, { color: p.color }]}>{p.glyph} </Text>
        {headline}
      </Text>
      {sub !== undefined && <Text style={s.sub}>{sub}</Text>}
    </View>
  );
}

/** `.sect` — small uppercase section label. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View>
      <Text style={s.sect}>{title}</Text>
      {children}
    </View>
  );
}

/** `.card` / `.card.flat` */
export function Card({ children, flat }: { children: ReactNode; flat?: boolean }) {
  return <View style={[s.card, flat === true && s.cardFlat]}>{children}</View>;
}

/**
 * `.tile` — a signal tile, with its pillar stripe.
 *
 * `unknown` renders "Not available" in muted type, per `.tile.unknown`. Never a zero, a dash
 * or a flat line: the pack is explicit that "I could not evaluate" must never look like
 * "you are fine".
 */
export function SignalTile({
  label,
  value,
  unit,
  detail,
  pillar,
  unknown,
  flag,
}: {
  label: string;
  value: string;
  unit?: string;
  detail: string;
  pillar: PillarId;
  unknown?: boolean;
  flag?: boolean;
}) {
  return (
    <View style={[s.tile, flag === true && s.tileFlag]}>
      <View style={[s.tileStripe, { backgroundColor: PILLAR[pillar] }]} />
      <View style={s.tileKeyRow}>
        <View style={[s.tileDot, { backgroundColor: PILLAR[pillar] }]} />
        <Text style={s.tileKey}>{label}</Text>
      </View>
      {unknown === true ? (
        <Text style={s.tileUnknown}>Not available</Text>
      ) : (
        <Text style={s.tileValue}>
          {value}
          {unit !== undefined && unit !== "" && <Text style={s.tileUnit}> {unit}</Text>}
        </Text>
      )}
      <Text style={s.tileDetail}>{detail}</Text>
    </View>
  );
}

export function Tiles({ children }: { children: ReactNode }) {
  return <View style={s.tiles}>{children}</View>;
}

/** `.chip` and its variants. */
export function Chip({ text, tone }: { text: string; tone?: "warm" | "calm" | "act" }) {
  const style =
    tone === "warm" ? s.chipWarm : tone === "calm" ? s.chipCalm : tone === "act" ? s.chipAct : null;
  const textStyle =
    tone === "warm"
      ? s.chipWarmText
      : tone === "calm"
        ? s.chipCalmText
        : tone === "act"
          ? s.chipActText
          : s.chipText;
  return (
    <View style={[s.chip, style]}>
      <Text style={textStyle}>{text}</Text>
    </View>
  );
}

/**
 * `.trace` — one layer's row in the Why this? trace.
 *
 * The left border takes the layer's pillar colour, which is how the trace stays readable as
 * five distinct layers rather than a flat list. `off` is for a rule that did NOT apply —
 * absence is information, and it renders dimmed rather than being omitted.
 */
export function TraceRow({
  name,
  layerLabel,
  evidence,
  outcome,
  pillar,
  off,
}: {
  name: string;
  layerLabel: string;
  evidence: string;
  outcome?: string;
  pillar?: PillarId;
  off?: boolean;
}) {
  return (
    <View
      style={[
        s.trace,
        { borderLeftColor: off === true || pillar === undefined ? color.line : PILLAR[pillar] },
        off === true && s.traceOff,
      ]}
    >
      <Text style={s.traceName}>{name}</Text>
      <Text style={s.traceLayer}>{layerLabel}</Text>
      <Text style={s.traceEvidence}>{evidence}</Text>
      {outcome !== undefined && <Text style={s.traceOutcome}>{outcome}</Text>}
    </View>
  );
}

/**
 * `.warnbox` — where two guidelines disagreed.
 *
 * Never suppressed. The ginger-for-a-Pitta collision is the case that matters: L1 outranks
 * L3 so the item stays, and the disagreement is SHOWN. Filtering these to make a screen look
 * clean would defeat the point.
 */
export function WarnBox({ text }: { text: string }) {
  return (
    <View style={s.warnbox}>
      <Text style={s.warnText}>{text}</Text>
    </View>
  );
}

/** `.note` — quiet aside on a tinted ground. */
export function Note({ text }: { text: string }) {
  return (
    <View style={s.note}>
      <Text style={s.noteText}>{text}</Text>
    </View>
  );
}

/** `.btn` — accent is the only fill. The pack: "no Water buttons". */
export function Button({
  label,
  kind,
  onPress,
}: {
  label: string;
  kind: "primary" | "secondary" | "quiet";
  onPress?: () => void;
}) {
  return (
    <Text
      accessibilityRole="button"
      onPress={onPress}
      style={[
        s.btn,
        kind === "primary" && s.btnPrimary,
        kind === "secondary" && s.btnSecondary,
        kind === "quiet" && s.btnQuiet,
      ]}
    >
      {label}
    </Text>
  );
}

/** `.link` */
export function Link({ text, onPress }: { text: string; onPress?: () => void }) {
  return (
    <Text accessibilityRole="button" onPress={onPress} style={s.link}>
      {text}
    </Text>
  );
}

/** `.disclaim` — mandatory on every recommendation surface. */
export function Disclaimer({ extra }: { extra?: string }) {
  return (
    <View style={s.disclaim}>
      {extra !== undefined && <Text style={s.disclaimText}>{extra}{"\n"}</Text>}
      <Text style={s.disclaimText}>{WELLNESS_DISCLAIMER}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  date: { ...font(type.caption), color: color.muted, paddingTop: 14, letterSpacing: 0.25 },
  verdict: { ...font(type.verdict), color: color.ink, marginTop: 12 },
  glyph: { fontSize: type.glyph.size },
  sub: { ...font(type.sub), color: color.muted, marginTop: 6 },
  sect: {
    ...font(type.section),
    color: color.muted,
    textTransform: "uppercase",
    marginTop: 24,
    marginBottom: 10,
  },
  card: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.card,
    padding: space.lg,
    marginVertical: space.md,
  },
  cardFlat: { backgroundColor: color.surface2, borderColor: "transparent" },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: space.lg },
  tile: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.tile,
    padding: 13,
    overflow: "hidden",
    flexBasis: "47%",
    flexGrow: 1,
  },
  tileFlag: { backgroundColor: color.flagBg, borderColor: color.flagLine },
  tileStripe: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
  tileKeyRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  tileDot: { width: 7, height: 7, borderRadius: 3.5 },
  tileKey: { ...font(type.tileKey), color: color.muted, textTransform: "uppercase" },
  tileValue: { ...font(type.tileValue), color: color.ink, marginTop: 6 },
  tileUnit: { fontSize: 14, fontWeight: "500", color: color.muted },
  tileUnknown: { fontSize: 17, fontWeight: "500", color: color.muted2, marginTop: 6, paddingTop: 5 },
  tileDetail: { fontSize: 12, lineHeight: 12 * 1.35, color: color.muted, marginTop: 3 },
  chip: {
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 5,
    backgroundColor: color.surface2,
    alignSelf: "flex-start",
  },
  chipText: { fontSize: 12, fontWeight: "600", color: color.muted },
  chipWarm: { backgroundColor: "#F7E7DA" },
  chipWarmText: { fontSize: 12, fontWeight: "600", color: "#8E4F26" },
  chipCalm: { backgroundColor: "#E7E0D6" },
  chipCalmText: { fontSize: 12, fontWeight: "600", color: "#5A4430" },
  chipAct: { backgroundColor: color.accent },
  chipActText: { fontSize: 12, fontWeight: "600", color: "#FFFFFF" },
  trace: { borderLeftWidth: 3, paddingLeft: 14, marginVertical: 14 },
  traceOff: { opacity: 0.6 },
  traceName: { fontSize: 15, fontWeight: "600", color: color.ink },
  traceLayer: {
    fontSize: 10.5,
    color: color.muted,
    textTransform: "uppercase",
    letterSpacing: 0.84,
    fontWeight: "600",
    marginTop: 2,
  },
  traceEvidence: { fontSize: 14, color: color.muted, marginTop: 7, lineHeight: 21 },
  traceOutcome: { fontSize: 14, color: color.ink, marginTop: 5, lineHeight: 21 },
  warnbox: {
    backgroundColor: color.warnBg,
    borderWidth: 1,
    borderColor: color.warnLine,
    borderRadius: 14,
    padding: 13,
    marginVertical: 14,
  },
  warnText: { fontSize: 13.5, lineHeight: 13.5 * 1.5, color: color.warnInk },
  note: { backgroundColor: color.surface2, borderRadius: radius.note, padding: 10, marginTop: 14 },
  noteText: { fontSize: 12, color: color.muted, lineHeight: 12 * 1.45 },
  btn: {
    textAlign: "center",
    borderRadius: radius.button,
    paddingVertical: 15,
    fontSize: 16,
    fontWeight: "600",
    marginTop: 10,
    overflow: "hidden",
  },
  btnPrimary: { backgroundColor: color.accent, color: "#FFFFFF" },
  btnSecondary: {
    backgroundColor: color.surface,
    color: color.ink,
    borderWidth: 1,
    borderColor: color.line,
  },
  btnQuiet: { color: color.muted, fontWeight: "500", fontSize: 15, paddingVertical: 12 },
  link: { color: color.accent, fontSize: 14.5, fontWeight: "600", marginTop: 12 },
  disclaim: {
    marginTop: 20,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: color.line,
  },
  disclaimText: { fontSize: 12, color: color.muted, lineHeight: 18 },
});
