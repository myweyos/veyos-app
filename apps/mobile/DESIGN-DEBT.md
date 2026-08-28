# Design debt

The approved design pack is **not in this repo**. Spec §5, `tokens.json`, the §5.7 component
inventory and the asset manifest are all absent, and the Appendix A copy available to me was
truncated part-way through A.6.

So parts of the UI are **inferred**. This file lists every inference so the real design pack
can overwrite it cleanly, rather than leaving someone to guess later which values were
approved and which were invented. Nothing here is a design decision anyone signed off.

## Stated in the brief — do not "improve" these

| Value | Source |
|---|---|
| `#C4794F` Fire — intervention, warm amber, explicitly **not** red | §5.1 / §5.4 |
| `#A33A34` danger — destructive **account** actions only, never a body signal | §5.1 |
| `#A79C93` muted — calibrating / partial / declined | A.4 state table |
| Glyphs `◇ ◐ ● ▲ ◆ ○` and their state words | A.4 state table |
| C2's three-part order: what changed → what I'm doing → actions | A.5 |
| C3 must show rules that did **not** apply, and why | A.5 |
| "Wellness guidance, not medical advice." on every recommendation surface | §4 constraint 11 |
| Banned vocabulary, hard and tone | §4 constraint 4 |

## Inferred — replace when the design pack lands

| Area | What I invented | Where |
|---|---|---|
| Earth / Air / Water hex | The brief names the pillars but gives no values | `src/theme/tokens.ts` |
| Full light + dark palette | bg, surface, border, text, textMuted, strike | `src/theme/tokens.ts` |
| Type scale | 5 sizes, points | `src/theme/tokens.ts` |
| Spacing + radius scale | 5 spacing steps, 3 radii | `src/theme/tokens.ts` |
| Component decomposition | 6 primitives. **The §5.7 inventory is what settles the 22-vs-23 question — I did not pick.** | `src/components/primitives.tsx` |
| Headline copy per state | Written to A.4's voice, but the exact strings are mine | `src/screens/copy.ts` |
| Signal tile labels | "Variability", "Resting heart rate", "Deep + REM", "Temperature" | `src/screens/copy.ts` |
| Layer names shown to users | "Live biometrics", "Cycle phase", "Your food profile", … | `src/screens/copy.ts` |

## Built, and built to the letter

- **B1–B6 Today** — one sentence and a colour. No charts, no streaks, no nudges.
- **C2 takeover** — strict three-part structure, the strikethrough on the user's *own* plan,
  "Not for me" always present at the same distance.
- **C3 Why this?** — layer-ordered, shows what did not apply, distinguishes "did not apply"
  from "could not be checked", carries the rulebook version, plain English with rule ids in a
  collapsed technical block.

## Not built

Everything else. A1–A11 first run, C1/C4/C5, D, E (including the E3 basket and its
reconciliation check), F, G, H1–H9, and the whole W wrapper. B8 is specified in Appendix A and
would be next; it needs the honesty-box copy verbatim, which I have.

## Known gaps that are not mine to close

- **No `decision_id`.** C3 is specified to show `decision 8f2a…c91`, but `decision.schema.json`
  carries no id field. Resolved in Phase 3 as a content hash — until then the trace shows
  rulebook version and date only.
- **Deltas exist only as prose.** `fired_rules[].because` carries
  `"hrv_ms 22.0% below baseline (threshold 20.0%)"` as a string. There is no structured
  `{signal, delta_pct, threshold}` anywhere, so a ring or sparkline has no machine-readable
  source. Computing one in the client would be rule logic outside the engine. Needs a contract
  change.
- **The app-state mapping is PROPOSED.** `packages/demo-fixtures/app-states.json` carries six
  open questions. Every screen here renders whatever that file resolves to; three of those
  questions change what a user is told.
- **Dynamic Type XXL is not verified.** The brief requires every component to render at XXL
  without the verdict block or the takeover truncating. Not tested — needs a device.

## Demo controls are not gated yet

`app/index.tsx` is a scenario switcher, and hard constraint 12 says no fake interventions in a
production build. Phase 9 puts it behind a build flag with a test that fails if any demo
control is reachable in production. Until then, **do not ship this**.
