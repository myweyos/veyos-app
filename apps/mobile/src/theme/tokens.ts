/**
 * Design tokens — Weyos brand kit v3.
 *
 * Transcribed from the approved design pack at
 * docs/design/Weyos_MVP_All_Screens_v0.5.html. These are the real values; the earlier
 * inferred palette has been replaced. Do not invent additions here — if a value is needed
 * and the pack does not define it, that is a question for design, not a guess.
 *
 * Two rules the pack states explicitly and this file encodes:
 *
 *   - "Pillar colours ARE state colours." Every app state takes its colour from one of the
 *     five pillars, or from muted. There is no separate state palette.
 *   - "Buttons stay Fire/accent only — no Water buttons." Accent is the only button fill.
 *
 * And two constraints from the build brief:
 *
 *   - `danger` is for destructive ACCOUNT actions only. Never a body signal. Intervention is
 *     Fire (warm amber), never red, and there is no siren iconography.
 *   - State is never colour alone: every state carries a distinct glyph AND a distinct word,
 *     so it survives colour-vision differences and bright sunlight.
 */

/**
 * The five pillars, outermost to innermost: ether, air, fire, water, earth.
 *
 * The order is the meaning — it is the order of the five arcs in the brand mark. This also
 * settles the open question of three elemental scores versus five: the design assumes five.
 */
export const PILLAR = {
  ether: "#9C8794",
  air: "#9C8A66",
  fire: "#C4794F",
  water: "#6E8A87",
  earth: "#6B5038",
} as const;

export type PillarId = keyof typeof PILLAR;

/** Rulebook layer → pillar. Taken from the pack's `.trace.l1`–`.l5` border colours. */
export const LAYER_PILLAR: Record<number, PillarId> = {
  1: "fire",
  2: "ether",
  3: "earth",
  4: "water",
  5: "air",
};

export const color = {
  ...PILLAR,
  cream: "#FDF6F1",
  ink: "#2A2622",
  darkGround: "#1C1A18",
  accent: "#C4794F",
  surface: "#FFFFFF",
  surface2: "#F6EEE7",
  line: "#EADFD5",
  muted: "#8A817A",
  muted2: "#A79C93",
  danger: "#A33A34",
  /** Warning box, from `.warnbox`. */
  warnBg: "#FBF0E4",
  warnLine: "#E9D2B9",
  warnInk: "#7E5426",
  /** Flagged signal tile, from `.tile.flag`. */
  flagBg: "#FEF8F2",
  flagLine: "#EBD3BE",
} as const;

/**
 * Type scale, transcribed from the pack's shared screen styles.
 *
 * Sizes are points and scale with Dynamic Type. The pack specifies line-height and letter
 * spacing per role, so both are carried here rather than left to each component.
 */
export const type = {
  verdict: { size: 31, line: 1.16, weight: "600" as const, spacing: -0.5 },
  title: { size: 24, line: 1.25, weight: "600" as const, spacing: -0.3 },
  section: { size: 11.5, line: 1.2, weight: "600" as const, spacing: 1.15 },
  body: { size: 15.5, line: 1.55, weight: "400" as const, spacing: 0 },
  sub: { size: 14, line: 1.5, weight: "400" as const, spacing: 0 },
  caption: { size: 12.5, line: 1.45, weight: "400" as const, spacing: 0 },
  glyph: { size: 22, line: 1, weight: "400" as const, spacing: 0 },
  tileValue: { size: 24, line: 1.2, weight: "600" as const, spacing: -0.5 },
  tileKey: { size: 11, line: 1.2, weight: "600" as const, spacing: 0.88 },
} as const;

/** Radii, from `--r-card` and `--r-btn`. Tiles are 16, per `.tile`. */
export const radius = { card: 20, button: 14, tile: 16, pill: 999, note: 10 } as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 17, xl: 24 } as const;

/**
 * The six app states.
 *
 * Glyphs, words and colours are exactly the pack's STATE map. The pack keys two of them
 * `balance` and `intervene`; the ids here stay `in_balance` and `intervention` to match
 * packages/demo-fixtures/app-states.json, which is committed data with tests against it. The
 * words a user sees are identical either way.
 */
export type AppStateId =
  | "calibrating"
  | "partial"
  | "in_balance"
  | "advisory"
  | "intervention"
  | "declined";

export interface StatePresentation {
  glyph: string;
  word: string;
  color: string;
  /** Only Intervention interrupts. Deliberate scarcity — one takeover a day, hard-capped. */
  interrupts: boolean;
}

export const STATE_PRESENTATION: Record<AppStateId, StatePresentation> = {
  calibrating: { glyph: "◇", word: "Calibrating", color: color.muted2, interrupts: false },
  partial: { glyph: "◐", word: "Partial", color: color.muted2, interrupts: false },
  in_balance: { glyph: "●", word: "In balance", color: PILLAR.earth, interrupts: false },
  advisory: { glyph: "▲", word: "Advisory", color: PILLAR.air, interrupts: false },
  intervention: { glyph: "◆", word: "Intervention", color: PILLAR.fire, interrupts: true },
  declined: { glyph: "○", word: "Declined", color: color.muted2, interrupts: false },
};

/** Present on every recommendation surface. Verbatim from the pack's `disclaim()`. */
export const WELLNESS_DISCLAIMER = "Wellness guidance, not medical advice.";
