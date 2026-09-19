/**
 * A11 — Baseline learning. The cold-start screen.
 *
 * The pack says "about three weeks" and "Day 1 of 21". The rulebook's min_days_for_baseline is
 * 28, so the copy here doesn't name a number. The Today screen shows the real count from the
 * baseline the engine used. Raised as a pack/rulebook mismatch rather than picked in code.
 */
import { router } from "expo-router";

import { Body, Screen, Title } from "../../src/components/form";
import { Button, Card } from "../../src/components/primitives";

export default function LearningStep() {
  return (
    <Screen>
      <Title text="Weyos is learning you" />
      <Body>
        Weyos needs a few weeks of your data to know what normal looks like for you specifically.
        Until then it stays quiet about your biometrics rather than guessing.
      </Body>
      <Card>
        <Body>
          Your food profile is active from today, so you’ll get real food guidance while the
          biometrics calibrate.
        </Body>
      </Card>
      <Button label="Go to Today" kind="primary" onPress={() => router.replace("/today")} />
    </Screen>
  );
}
