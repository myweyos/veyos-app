/**
 * Design tokens — PROVISIONAL.
 *
 * The approved design pack (spec §5, tokens.json, the §5.7 component inventory) is NOT in
 * this repo. Three values below are stated verbatim in the build brief; everything else is
 * inferred and MUST be replaced when the real tokens land. Every inferred value is marked
 * `INFERRED`. See apps/mobile/DESIGN-DEBT.md for the full list and how to retire it.
 *
 * Two rules from the brief's hard constraints are encoded here rather than left to a
 * reviewer's memory:
 *
 *   - `danger` is for destructive ACCOUNT actions only. It is never used for a body signal.
 *     Intervention is warm amber (Fire), never red, and there is no siren iconography.
 *   - State is never colour alone. Every state carries a distinct glyph AND a distinct word,
 *     so it survives colour-vision differences and bright sunlight.
 */

/** Values quoted directly in the design brief. Do not "improve" these. */
export const STATED = {
  fire: "#C4794F", // intervention — warm amber, explicitly NOT red
  danger: "#A33A34", // destructive account actions ONLY
  muted: "#A79C93", // calibrating / partial / declined
} as const;

export const color = {
  ...STATED,

  // INFERRED — the brief names Earth / Air / Water as pillars but gives no hex.
  earth: "#7A8471", // in balance
  air: "#8C9BAB", // advisory
  water: "#6E8CA0", // B8 environment coding

  // INFERRED — no palette supplied.
  bg: "#FBF9F7",
  surface: "#FFFFFF",
  border: "#E8E2DC",
  text: "#2B2723",
  textMuted: "#6B625B",
  strike: "#A79C93",
} as const;

export const colorDark = {
  ...STATED,
  earth: "#93A088",
  air: "#A3B2C2",
  water: "#89A6BA",
  bg: "#191614",
  surface: "#221E1B",
  border: "#332D28",
  text: "#F2EDE8",
  textMuted: "#A79C93",
  strike: "#6B625B",
} as const;

/** INFERRED — no type scale supplied. Sizes are in points and scale with Dynamic Type. */
export const type = {
  display: 30,
  title: 22,
  body: 16,
  label: 14,
  caption: 12,
} as const;

/** INFERRED — no spacing scale supplied. */
export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = { sm: 6, md: 12, lg: 20 } as const;

/**
 * The six app states.
 *
 * Glyphs, words and voice are quoted from the brief's state table (Appendix A.4). The
 * mapping from the engine's three states to these six lives in
 * packages/demo-fixtures/app-states.json and is still PROPOSED — see its open_questions.
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
  tone: string;
  interrupts: boolean;
}

export const STATE_PRESENTATION: Record<AppStateId, StatePresentation> = {
  calibrating: { glyph: "◇", word: "Calibrating", tone: "muted", interrupts: false },
  partial: { glyph: "◐", word: "Partial", tone: "muted", interrupts: false },
  in_balance: { glyph: "●", word: "In balance", tone: "earth", interrupts: false },
  advisory: { glyph: "▲", word: "Advisory", tone: "air", interrupts: false },
  // The ONLY state that interrupts. Deliberate scarcity: if the takeover becomes wallpaper
  // it stops working.
  intervention: { glyph: "◆", word: "Intervention", tone: "fire", interrupts: true },
  declined: { glyph: "○", word: "Declined", tone: "muted", interrupts: false },
};

export const toneColor = (
  tone: string,
  palette: typeof color | typeof colorDark,
): string => {
  switch (tone) {
    case "earth":
      return palette.earth;
    case "air":
      return palette.air;
    case "fire":
      return palette.fire;
    default:
      return palette.muted;
  }
};

/**
 * Present on every recommendation surface. Hard constraint 11.
 * Supplement surfaces carry a fuller disclaimer — see DESIGN-DEBT.md.
 */
export const WELLNESS_DISCLAIMER = "Wellness guidance, not medical advice.";
