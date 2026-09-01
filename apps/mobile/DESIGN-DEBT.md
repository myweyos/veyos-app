# Design debt

The approved design pack is now in the repo at
`docs/design/Weyos_MVP_All_Screens_v0.5.html` — a working prototype of all 59 surfaces,
openable in any browser. It is the source of truth for anything visual.

Most of the earlier debt is retired: the palette, type scale, radii, state glyphs and colours
were all replaced with the real brand kit v3 values. What follows is what genuinely remains.

## Ported to React Native

| Screen | Status |
|---|---|
| B1–B6 Today | Ported. Verdict block, pillar-coded signal tiles, unknown-tile treatment. |
| C2 Takeover | Ported. Evidence first, strikethrough on the user's own plan, "Not for me" at a fixed distance. |
| C3 Why this? | Ported. Layer-ordered rows in pillar colours, "couldn't be checked" kept distinct from "did not apply". |

Everything else — A1–A11, B7, B8, C1/C4/C5, D, E, F, G, H1–H10, W1–W9 — exists in the pack
and is **not** ported. Open the HTML to see them.

## Still not supplied

- **The design spec document itself.** The pack is the prototype; §5.7's component inventory
  (22 vs 23 components) lives in the spec, which is still absent. The primitives here cover
  what the three ported screens need, and deliberately do not claim to be the inventory.
- **A dark palette.** The pack defines one light palette on a cream ground and specifies no
  dark variant, so `useTheme` returns the single palette rather than inventing one. `app.json`
  still sets `userInterfaceStyle: "automatic"`. That is a question for design.
- **Dynamic Type XXL.** The brief requires every component to render at XXL without the
  verdict block or the takeover truncating. Not verified — needs a device.

## Gaps that are not design's to close

- **No `decision_id`.** C3 is specified to show `decision 8f2a…c91`, but `decision.schema.json`
  carries no id field. Phase 3 resolves this as a content hash. Until then the trace shows
  rulebook version and date only.
- **Deltas exist only as prose.** `fired_rules[].because` carries
  `"hrv_ms 22.0% below baseline (threshold 20.0%)"` as a string. There is no structured
  `{signal, delta_pct, threshold}`, so the pack's sparkline (`spark()`) and its
  "22% below your usual (55ms)" tile captions have no machine-readable source. Computing one
  in the client would be rule logic outside the engine. Needs a contract change.
- **The app-state mapping is still PROPOSED.** `packages/demo-fixtures/app-states.json` carries
  its open questions. One of them is now answerable — see below.

## The James discrepancy — needs a decision

The pack and the engine fixtures disagree about James, and the disagreement is the whole
James gap.

**The pack** gives him `Wrist temp: "—", unknown: true, "No reading since Monday"`, sets
`defaultState: 'partial'`, and writes the copy to match:

> "With no wrist temperature, I can't check your immune and inflammatory rule either way — so
> I'm not telling you you're fine."

It also states outright that In balance is *unreachable* for him today: *"his wrist temperature
is missing, so he sits in B2 Partial instead."*

**The engine fixtures** give him `wrist_temp_delta_c: 0.1` — present and normal. Rule 1.3's
dual gate therefore resolves cleanly to FALSE rather than UNKNOWN, no warning is raised, and he
lands in `calm` → "In balance today". That is fixture F5, pinned as current behaviour.

So the false reassurance in F5 is partly an artefact of the fixture supplying a
present-but-normal temperature. Under the pack's data, three-valued evaluation already does
the right thing without candidate rule 1.4: the reading is absent, 1.3 is unevaluable, and the
app says so.

This is exactly the question CLAUDE.md flags as *"the sources disagree on whether F5 lands in
B2 or B3"*. **Do not resolve it by editing `personas.json`** — that would change a pinned
golden fixture and silently answer an open spec question. It needs a `[SPEC]` issue and a
ruling on which James is canonical.

Worth noting: the app-state mapping in `app-states.json` narrows `partial` to Layer 1, and
under the pack's data that narrowing produces exactly the pack's intended state. The mapping
appears correct; it is the fixture data that diverges.
