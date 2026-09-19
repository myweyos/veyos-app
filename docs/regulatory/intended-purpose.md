# Intended purpose — Weyos

| | |
|---|---|
| **Status** | **DRAFT — not approved. Do not publish or quote.** |
| **Version** | 0.1 (2026-09-14) |
| **Owner** | John (product) |
| **Required review** | Legal / regulatory counsel, UK and US (SCRUM-121 AC1) |
| **Sources** | `docs/compliance.md`; design pack v0.5 screens A1, H7, W9 and the disclaimers; `config/rules/rules.v1.yaml`; `CLAUDE.md`; plan v2 |

This file is where the intended purpose will be stated once it's approved. Nothing else —
store listing, website, in-app copy, decks, press, case studies, founder statements — should
say anything this statement doesn't support (SCRUM-121 AC2). SCRUM-122, the claims audit,
checks everything else against it.

It was drafted by assembling what the repo and the design pack already say. It is a starting
point for counsel, not a position. **§4 lists where the product as built pulls against its own
statement.** Those are the parts counsel most needs to read.

---

## 1. The statement (draft)

> Weyos is a consumer wellness app for adults. With the user's permission, it reads recovery,
> sleep and activity data from their own phone and wearable devices, and, if they choose to add
> them, their menstrual cycle day and lab results they already hold. It compares these with the
> user's own recent history and applies a fixed, published set of rules to suggest changes to
> that day's exercise, food and routine, to support general wellbeing. Every suggestion shows
> the rule and the data behind it.
>
> Weyos is not a medical device. It is not intended to diagnose, treat, cure, prevent or monitor
> any disease or condition; to interpret lab results for a clinical purpose; to inform
> contraception or fertility decisions; or to replace advice from a healthcare professional.
> It must not be used in an emergency or to judge whether something is serious.

The statement itself names the claims it disclaims. That is deliberate and normal for this kind
of text, and it is why the copy lint (SCRUM-123) keeps a reviewed exception list. Rendering any
part of it in the app needs an exception entry for that exact string.

## 2. Elements

| Element | Draft position | Where it comes from |
|---|---|---|
| **Intended user** | Adults, self-selecting, using their own data | Not stated anywhere in the repo. **Open (§4.6)** |
| **Use environment** | Home and daily life, on the user's own phone | Product design; no clinical setting |
| **Inputs** | HRV, resting heart rate, sleep, wrist temperature, steps (wearable/phone); cycle day (user-entered or synced); lab results the user already holds; weather and season; a constitution profile | `signal-snapshot.schema.json`, rulebook |
| **Processing** | A deterministic rulebook of 16 rules in 5 layers. No machine learning. Same input, same output. Every output traced to a rule | `CLAUDE.md`, `docs/engine.md`, ADR 0003 |
| **Outputs** | One daily suggestion: an activity change, food changes, supplement *suggestions* with no doses, and routine constraints, each with its reasoning | `decision.schema.json`, design pack C2/C3, D-series |
| **Conversational layer** | Reports what the engine decided, in the user's words. It never decides and never narrates a Layer 1 decision | `CLAUDE.md` non-negotiables 7–8; W9 |
| **Claims made** | Personal-baseline comparison; explainable suggestions; transparency of reasoning | A1, H7, W9 |
| **Claims not made** | Diagnosis, treatment, cure, prevention, monitoring of illness; clinical interpretation of labs; fertility/contraception; emergency use; substitute for a doctor | A1, H7, W9, `compliance.md` |
| **Markets** | UK and US at launch, wellness (non-device) positioning in both | `compliance.md`, plan v2 |

## 3. Where the statement is rendered

| Surface | Current text | State |
|---|---|---|
| A1 Welcome | "It isn't a medical device and doesn't diagnose, treat or monitor illness. It's wellness guidance. In an emergency call your local emergency number…" | Design pack; not built |
| H7 About | "It is not a medical device. It does not diagnose, treat, cure or monitor any condition, and it is not a substitute for a doctor." | Design pack; not built |
| W9 What Weyos can and can't answer | "Name a condition, or rule one out — That's diagnosis. Weyos isn't a medical device" | Design pack; not built |
| Footer disclaimer, every screen | "Wellness guidance, not medical advice." | Built: `apps/mobile/src/theme/tokens.ts` |
| Supplements | "Suggestions only — not medical advice, and no doses. Check with a pharmacist or doctor…" | Design pack; not built |
| App Store / Play listing, website, decks, press, case studies | — | **Not in the repo.** SCRUM-122 |

A1 and H7 already disagree slightly: A1 says "illness" where H7 says "any condition", and only H7
adds "cure" and "substitute for a doctor". Once this statement is approved, both should be
derived from it.

## 4. Tensions for counsel — where the product pulls against the statement

Each of these is a question, not an answer. Nothing below has been changed in code.

1. **"Watches" vs "does not monitor".** A1's tagline is *"Weyos watches, so you don't have to."*
   and its body says Weyos "speaks up only when something has changed". The same screen says it
   doesn't "monitor illness". Continuous watching plus alerting on change is close to what
   regulators call monitoring. The tagline is already open in the pack for a different reason
   (plan v2 §9.12).
2. **Layer 5 reads lab results.** Rules 5.1–5.3 act on HbA1c, fasting glucose, hs-CRP and PM
   cortisol flagged `high`, and change food, supplements and constraints. Software that takes
   clinical lab values and adjusts recommendations is the most device-like function in the
   product. The draft says "not intended to interpret lab results for a clinical purpose".
   Counsel should judge whether that holds, given the engine *is* acting on them.
3. **Rule names and messages read as clinical.** Users see rule names on the trace screen:
   "Immune / Inflammatory Spike", "Sleep Debt / Cortisol Dysregulation", "Adrenal Fatigue",
   "Systemic Inflammation", "Blood Sugar Dysregulation". Rule 1.3's message is *"Your body is
   fighting something."* `compliance.md` says messages must never read like "you have an
   infection". None of these trips the banned-vocabulary list, which is why this needs a human.
4. **Cycle data and fertility.** Layer 2 is a 28-day cycle model with an "Ovulatory" phase
   (days 14–15) and a "Peak output window" message. A cycle-tracking wellness product naming
   ovulation days is next to a regulated category (contraception and fertility apps). The draft
   excludes that use explicitly. Counsel should confirm that's enough, and whether the phase
   *name* is shown.
5. **Supplements.** Zinc, vitamin C, L-theanine, ashwagandha, omega-3 and curcumin are suggested
   by rule. There are no doses, and the pack has a pharmacist caveat. Counsel should confirm
   that "suggestion" language holds in both markets, especially ashwagandha in the UK.
6. **Who it's for.** No age floor and no exclusions are written anywhere: pregnancy, under-18s,
   people with a condition managed by a clinician, eating disorders (calorie deltas and macro
   floors are outputs). The statement says "adults". Everything else is open.
7. **The elemental layer.** Layers 3/4 (Ayurvedic constitution, moon phase, season) run by
   default. The "validated biometrics only" mode exists *so that* clinical and regulatory
   audiences can be shown a version without them (`compliance.md`, F11). Any claim about what
   the elemental layer does needs care. Astrology and numerology are undecided (plan v2 §9.1),
   and H9 currently promises they aren't used.
8. **The conversational agent can take actions on the user's plan** (plan v2 §6), under
   confirmation. Counsel should check that an agent which acts, not only reports, still sits
   inside this statement.

## 5. What would invalidate this statement

Re-review the statement before any of these ships:

- a rule whose output names or implies a condition, or any new Layer 1 or Layer 5 rule (e.g.
  candidate 1.4, Cardiovascular Load);
- any change to how lab values are used;
- ML or any non-deterministic step in a health judgement;
- the agent gaining a tool that writes outside the effect layer;
- astrology or numerology shipping (§9.1);
- a new market, or a new population (e.g. under-18s);
- any provider integration (it would pull the product toward HIPAA scope; `compliance.md`).

## 6. Sign-off

| Role | Name | Date | Decision |
|---|---|---|---|
| Product owner | | | |
| Regulatory counsel — UK | | | |
| Regulatory counsel — US | | | |

Until this table is filled in, the statement is a draft and SCRUM-121 stays open.
