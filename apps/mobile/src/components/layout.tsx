/**
 * Layout primitives, ported from the design pack.
 *
 * Companion to primitives.tsx. Each maps to a class in
 * docs/design/Weyos_MVP_All_Screens_v0.5.html: `.planrow`, `.rowlink`, `.pillrow`/`.pilllab`,
 * `.to-kicker`, `.to-what`, `.evid`, `.swap`, `.btnrow`, and the calibration progress bar.
 */

import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { PILLAR, type PillarId, color, radius } from "../theme/tokens";

/**
 * `.planrow` — a row in the Tonight card.
 *
 * The 66px time column is what makes a struck-through plan and its replacement line up
 * vertically. That alignment is what makes the swap legible at a glance.
 */
export function PlanRow({
  time,
  children,
  last,
}: {
  time?: string;
  children: ReactNode;
  last?: boolean;
}) {
  return (
    <View style={[s.planrow, last === true && s.planrowLast]}>
      <Text style={s.planTime}>{time ?? ""}</Text>
      <View style={s.planBody}>{children}</View>
    </View>
  );
}

export function Struck({ text }: { text: string }) {
  return <Text style={s.strike}>{text}</Text>;
}

/** The replacement, under a downward arrow. `↓`, not `→` — the pack is vertical here. */
export function Replacement({ text }: { text: string }) {
  return (
    <Text style={s.replacement}>
      <Text style={s.arrow}>↓ </Text>
      {text}
    </Text>
  );
}

export function Caption({ text }: { text: string }) {
  return <Text style={s.cap}>{text}</Text>;
}

/** `.rowlink` — tappable row with a chevron. Used by the Tonight's food card. */
export function RowLink({
  title,
  detail,
  onPress,
}: {
  title: string;
  detail: string;
  onPress?: () => void;
}) {
  return (
    <View style={s.rowlink} accessibilityRole="button" onTouchEnd={onPress}>
      <View style={s.rowlinkText}>
        <Text style={s.rowlinkTitle}>{title}</Text>
        <Text style={s.cap}>{detail}</Text>
      </View>
      <Text style={s.chevron}>›</Text>
    </View>
  );
}

/** `.pillrow` / `.pilllab` — names the pillar carrying a signal or a layer. */
export function PillarLabel({ pillar, text }: { pillar: PillarId; text: string }) {
  return (
    <View style={s.pillrow}>
      <View style={[s.pillDot, { backgroundColor: PILLAR[pillar] }]} />
      <Text style={s.pillText}>{text}</Text>
    </View>
  );
}

/** `.to-kicker` — the takeover's small accent eyebrow. */
export function Kicker({ text }: { text: string }) {
  return <Text style={s.kicker}>{text}</Text>;
}

/** `.to-what` — the takeover's lead sentence. Evidence, before any instruction. */
export function WhatChanged({ text }: { text: string }) {
  return <Text style={s.what}>{text}</Text>;
}

/** `.evid` — the evidence chip row. */
export function EvidenceRow({ children }: { children: ReactNode }) {
  return <View style={s.evid}>{children}</View>;
}

/** `.swap` — the card holding the struck plan and its replacement. */
export function Swap({ children }: { children: ReactNode }) {
  return <View style={s.swap}>{children}</View>;
}

export function SwapLabel({ text }: { text: string }) {
  return <Text style={s.swapLabel}>{text}</Text>;
}

/** `.btnrow` — two buttons side by side. */
export function ButtonRow({ children }: { children: ReactNode }) {
  return <View style={s.btnrow}>{children}</View>;
}

/** Calibration progress. Accent fill on a `--surface-2` track. */
export function Progress({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <View style={s.track}>
      <View style={[s.fill, { width: `${pct}%` }]} />
    </View>
  );
}

const s = StyleSheet.create({
  planrow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: color.line,
  },
  planrowLast: { borderBottomWidth: 0 },
  planTime: { fontSize: 13, color: color.muted, width: 66, paddingTop: 2 },
  planBody: { flex: 1 },
  strike: { fontSize: 15.5, color: color.muted, textDecorationLine: "line-through" },
  replacement: { fontSize: 15.5, fontWeight: "600", color: color.ink, marginTop: 4 },
  arrow: { color: color.accent, fontWeight: "700" },
  cap: { fontSize: 12.5, color: color.muted, lineHeight: 12.5 * 1.45, marginTop: 3 },
  rowlink: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  rowlinkText: { flex: 1 },
  rowlinkTitle: { fontSize: 15.5, fontWeight: "600", color: color.ink },
  chevron: { color: color.muted, fontSize: 18 },
  pillrow: { flexDirection: "row", gap: 5, alignItems: "center", marginTop: 12 },
  pillDot: { width: 8, height: 8, borderRadius: 4 },
  pillText: { fontSize: 11.5, color: color.muted, fontWeight: "600" },
  kicker: {
    fontSize: 11.5,
    textTransform: "uppercase",
    letterSpacing: 1.27,
    color: color.accent,
    fontWeight: "700",
  },
  what: {
    fontSize: 25,
    lineHeight: 25 * 1.26,
    fontWeight: "600",
    letterSpacing: -0.4,
    color: color.ink,
    marginTop: 12,
  },
  evid: { flexDirection: "row", gap: 7, flexWrap: "wrap", marginTop: 15 },
  swap: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: 18,
    padding: 15,
    marginTop: 20,
  },
  swapLabel: {
    fontSize: 12.5,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontWeight: "600",
    color: color.muted,
  },
  btnrow: { flexDirection: "row", gap: 10 },
  track: {
    height: 7,
    backgroundColor: color.surface2,
    borderRadius: 4,
    marginTop: 10,
    overflow: "hidden",
  },
  fill: { height: "100%", backgroundColor: color.accent, borderRadius: radius.note },
});
