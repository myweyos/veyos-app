/**
 * B1–B6 — Today. One screen, six states.
 *
 * Ported from the design pack. Every state shares the same spine:
 *
 *   date → verdict → signal tiles → Tonight → Tonight's food → disclaimer
 *
 * and differs only in the verdict copy and what sits between. Keeping the spine constant is
 * what makes the states comparable at a glance.
 *
 * The distinction the pack cares about most: Calibrating and Partial must look visibly
 * different from In balance, because "I could not evaluate" must never look like "you are
 * fine". Partial gets a tappable warn box above the tiles saying exactly what could not be
 * checked — it is the state three-valued evaluation exists for.
 */

import { ScrollView, StyleSheet, Text, View } from "react-native";

import type { DemoDay } from "@weyos/demo-fixtures";

import {
  Button,
  Card,
  DateLine,
  Disclaimer,
  Link,
  Note,
  Section,
  SignalTile,
  Tiles,
  Verdict,
  WarnBox,
} from "../components/primitives";
import {
  ButtonRow,
  Caption,
  PlanRow,
  Progress,
  Replacement,
  RowLink,
  Struck,
} from "../components/layout";
import { color, space } from "../theme/tokens";
import { headlineFor, longDate, signalTilesFor, subFor, unevaluableSentence } from "./copy";

export function Today({
  day,
  onWhyThis,
  onTakeover,
}: {
  day: DemoDay;
  onWhyThis: () => void;
  onTakeover: () => void;
}) {
  const decision = day.decision;
  const activity = decision.activity;
  const state = day.app_state;
  const tiles = signalTilesFor(day);
  const warnings = decision.warnings ?? [];

  const planChanged = activity.verdict !== "allow" && activity.prescribed !== activity.planned;
  const history = day.snapshot.baselines?.days_of_history ?? 0;

  return (
    <ScrollView style={s.page} contentContainerStyle={s.content} testID="screen-today">
      <DateLine text={longDate(decision.as_of)} />
      <Verdict state={state} headline={headlineFor(day)} sub={subFor(day)} />

      {/* B1 — no deviations shown, because there is nothing yet to deviate from. */}
      {state === "calibrating" && (
        <Card>
          <View style={s.between}>
            <Text style={s.cardLabel}>Baseline</Text>
            <Text style={s.cardMuted}>{Math.max(0, 28 - history)} days to go</Text>
          </View>
          <Progress done={history} total={28} />
          <Caption text={`Day ${history} of 28`} />
        </Card>
      )}

      {/* B2 — the state three-valued evaluation exists for. Tappable through to the trace. */}
      {state === "partial" && <WarnBox text={unevaluableSentence(day)} onPress={onWhyThis} />}

      <Tiles>
        {tiles.map((t) => (
          <SignalTile
            key={t.label}
            label={t.label}
            value={t.value}
            unit={t.unit}
            detail={t.detail}
            pillar={t.pillar}
            unknown={t.unknown}
          />
        ))}
      </Tiles>

      <Section title="Tonight">
        <Card>
          <PlanRow time={activity.location ?? ""} last>
            {planChanged ? (
              <>
                <Struck text={activity.planned ?? "your session"} />
                <Replacement text={activity.prescribed ?? "rest"} />
              </>
            ) : (
              <>
                <Text style={s.planText}>{activity.planned ?? "your session"}</Text>
                <Caption
                  text={state === "declined" ? "Kept, at your request" : "As you planned it"}
                />
              </>
            )}
          </PlanRow>
          <Link
            text={state === "declined" ? "ⓘ See what I suggested and why" : "ⓘ Why this?"}
            onPress={onWhyThis}
          />
        </Card>
      </Section>

      {warnings.map((w) => (
        <WarnBox key={w} text={w} />
      ))}

      <Section title="Tonight's food">
        <Card>
          <RowLink
            title={mealLine(decision)}
            detail={foodDetail(decision, state === "calibrating")}
          />
        </Card>
      </Section>

      {/* B5 — the two actions the takeover resolves to, available from Today as well. */}
      {state === "intervention" && (
        <ButtonRow>
          <Button label="Do it now" kind="primary" onPress={onTakeover} />
          <Button label="See my food" kind="secondary" onPress={onTakeover} />
        </ButtonRow>
      )}

      {/* B6 — saying no is respected, and visibly recorded rather than hidden. */}
      {state === "declined" && (
        <Note
          text={
            "Your signals are still being recorded, and this decision is in your history. " +
            "Nothing is being hidden from you — it just isn't being pushed at you."
          }
        />
      )}

      <Disclaimer />
    </ScrollView>
  );
}

function mealLine(decision: DemoDay["decision"]): string {
  const meals = decision.food.meals;
  const dinner = meals.find((m) => m.slot === "dinner") ?? meals[0];
  const first = dinner?.items[0];
  return first?.name ?? "Tonight's plate";
}

function foodDetail(decision: DemoDay["decision"], calibrating: boolean): string {
  if (calibrating) return "From your food profile only, while the biometrics calibrate";
  const added = decision.food.meals.reduce((n, m) => n + (m.slot === "additions" ? m.items.length : 0), 0);
  const removed = decision.food.meals.reduce((n, m) => n + m.removed.length, 0);
  if (added === 0 && removed === 0) return "Nothing set aside tonight";
  return `${added} added · ${removed} set aside`;
}

const s = StyleSheet.create({
  page: { backgroundColor: color.cream },
  content: { paddingHorizontal: 20, paddingBottom: 60 },
  between: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardLabel: { fontSize: 13.5, fontWeight: "600", color: color.ink },
  cardMuted: { fontSize: 13.5, color: color.muted },
  planText: { fontSize: 15.5, color: color.ink },
});
