# Copy lint

Stops banned vocabulary and banned tone from reaching a user (SCRUM-123).

```bash
node tools/copy-lint/check.mjs             # the check CI runs
node --test tools/copy-lint/lint.test.mjs  # its own tests
```

## Why

Weyos is wellness guidance, not a medical device. Words like *diagnose*, *detect*, *symptom* or
*cardiac* make a medical claim however they're meant. Words like *should*, *failed* or *streak*
put a judgement on the user. Both lists are in [`terms.json`](terms.json), with the inflections
that count. Reviewing that file means reviewing the inflections as well: *missing* is deliberately
not treated as *missed*.

## What it scans

User-facing copy only:

| Surface | What counts as copy |
|---|---|
| `apps/mobile/**/*.ts(x)` | String literals, template-literal text, JSX text, and JSX attribute values except non-rendered ones (`testID`, `accessibilityRole`, …). `accessibilityLabel` **is** copy, because a screen reader says it aloud. |
| `config/rules/*.yaml` | Rule `name` (shown in the trace), `message`, activity `suggestions` / `downgrade_to` (the prescribed activity), and `food.add_items[].name`. Disabled rules are included, because enabling one ships it. |

It does **not** scan:

- **Comments.** Files are parsed with the TypeScript compiler, so a comment is never mistaken for copy. `copy.ts` lists the banned words in its header and passes.
- **Code tokens.** Module specifiers, string-literal types, `case` labels, either side of `===` / `in`, property names and element-access keys. `activity.prescribed` and `activity["prescribed"]` are field names and pass. `<Text>Prescribed: …</Text>` is copy and fails.
- **Tests** (`*.test.*`, `*.spec.*`) and `.d.ts`.
- **Engine-generated text** such as trace `because` strings and warnings. Those are produced by `services/engine` code, not written as copy, and they need their own review when the agent starts narrating them.

## Exceptions

[`exceptions.json`](exceptions.json) is the reviewed list of legitimate uses. Each entry allows
named terms in **one exact string in one file**, with a `reason` and the ticket or PR that
approved it (`approved_in`). Reword the string and the exception stops matching. An exception
that matches nothing fails the lint, so the list can't quietly go stale.

The only entry so far is the wellness disclaimer, "Wellness guidance, not medical advice.", where
*medical* is there to deny the claim.

## Adding a surface

When something new starts rendering text (a web client, notification templates, agent prompts),
add it to `TS_ROOTS` in `check.mjs` or add an extractor in `lint.mjs`, with a test.
