/** A1 — Welcome. Copy verbatim from the design pack, including what Weyos is not. */
import { router } from "expo-router";
import { StyleSheet, Text } from "react-native";

import { Body, Screen, StepDots, Title } from "../src/components/form";
import { Button, Card } from "../src/components/primitives";
import { WHAT_WEYOS_IS_NOT, color } from "../src/theme/tokens";

export default function Welcome() {
  return (
    <Screen>
      <Title text="Weyos watches, so you don’t have to." />
      <Body>
        Weyos learns what normal looks like for you — your recovery, your sleep, your cycle, your
        labs — and speaks up only when something has changed.
      </Body>
      <Card flat>
        <Text style={s.strong}>What Weyos is not.</Text>
        <Text style={s.sub}>{WHAT_WEYOS_IS_NOT}</Text>
      </Card>
      <StepDots step={1} of={5} />
      <Button label="Get started" kind="primary" onPress={() => router.push("/sign-in")} />
      <Button label="I already have an account" kind="quiet" onPress={() => router.push("/sign-in")} />
    </Screen>
  );
}

const s = StyleSheet.create({
  strong: { fontWeight: "600", fontSize: 15, color: color.ink },
  sub: { marginTop: 6, fontSize: 14, lineHeight: 21, color: color.muted },
});
