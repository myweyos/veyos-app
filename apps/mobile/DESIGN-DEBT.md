# Design debt

The approved design pack is now in the repo at
`docs/design/Weyos_MVP_All_Screens_v0.5.html` — a working prototype of all 59 surfaces,
openable in any browser. It is the source of truth for anything visual.

Most of the earlier debt is retired: the palette, type scale, radii, state glyphs and colours
were all replaced with the real brand kit v3 values. What follows is what genuinely remains.

## Ported to React Native

| Screen | Status |
|---|---|
| A1 Welcome, A2 Sign in (email code), A3 Region, A4 Consent, A6 Cycle, A7 Food profile, A10 Connect (Health Connect), A11 Learning | Ported, on the real API. Deviations from the pack, each deliberate: A4's optional consents start **off** (pre-ticked consent isn't valid); the "stored in your region" and "encrypted" lines are held back until they're true (SCRUM-77, hosting); A7 asks the one question the pack specifies (it says "1 of 3"); A10 omits the chest strap until BLE exists; A11 names no day count (the pack says 21, the rulebook needs 28). |
| B1–B6 Today | Ported, on the subject's stored decision. Verdict block, pillar-coded signal tiles, unknown-tile treatment. |
| C2 Takeover | Ported. Evidence first, strikethrough on the user's own plan, "Not for me" at a fixed distance and recorded as a decline (on the device, until the decline event exists server-side). |
| C3 Why this? | Ported. Layer-ordered rows in pillar colours; "couldn't be checked" (Layer 1) kept distinct from "not applicable" (no cycle, no labs); decision id shown. |
| Settings | Consents, Health Connect permissions, sign out, delete account. Not the pack's H-section layout yet. |

Not ported: A5, A8, A9, B7, B8, C1/C4/C5, D, E, F, G, H1–H10, W1–W9. Sign in with Apple and
Google wait on store enrolment and OAuth configuration.

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

- **Deltas exist only as prose.** `fired_rules[].because` carries
  `"hrv_ms 22.0% below baseline (threshold 20.0%)"` as a string. There is no structured
  `{signal, delta_pct, threshold}`, so the pack's sparkline (`spark()`) and its
  "22% below your usual (55ms)" tile captions have no machine-readable source. Computing one
  in the client would be rule logic outside the engine. Needs a contract change.
- **The app-state mapping is still PROPOSED.** `packages/app-state/app-states.json` carries
  its open questions.

## The RHR-alone gap (formerly "the James discrepancy") — settled for the fixtures

The pack's James had no wrist temperature, so rule 1.3 was unevaluable and he sat in B2
Partial. The old fixture gave him a present, normal temperature, which put him in "In balance
today". Plan v2 §3 ruled the difference a test-data bug. The personas are gone now, and the
golden fixtures carry both cases on synthetic snapshots:

- **F5**: RHR up, temperature missing, so 1.3 is unevaluable and the day is Partial, as the
  pack draws it.
- **F19**: RHR up, temperature present and normal, so 1.3 is cleanly FALSE and the day reads
  "In balance today". This is still a product defect, and it's what candidate rule 1.4 would
  address (plan v2 §9.3, undecided).

On Android specifically, Health Connect supplies no wrist temperature, so every Android
subject gets F5's behaviour: 1.3 is never evaluable, and Today says so on the temperature tile.
