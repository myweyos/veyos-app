/**
 * Where a launch lands. No screen here: it routes on the real session and account state.
 *
 *   build not configured → /config-missing
 *   signed out           → /welcome (A1)
 *   signed in, onboarding unfinished → the first unanswered step (A3, A4 or A7)
 *   onboarded            → /today
 */
import { Redirect } from "expo-router";
import { Text } from "react-native";

import { Busy, Screen, Sub, Title } from "../src/components/form";
import { Button } from "../src/components/primitives";
import { firstUnfinishedStep } from "../src/lib/onboarding";
import { useSession } from "../src/state/session";

export default function Launch() {
  const { status, me, meError, refreshMe, signOut } = useSession();

  if (status === "not_configured") return <Redirect href="/config-missing" />;
  if (status === "signed_out") return <Redirect href="/welcome" />;
  if (status === "loading") {
    return (
      <Screen>
        <Busy />
      </Screen>
    );
  }
  if (me === null && meError !== null) {
    return (
      <Screen>
        <Title text="Weyos can't reach its server" />
        <Sub text="Your account is fine. Check your connection and try again." />
        <Text accessibilityLabel="error code">{meError}</Text>
        <Button label="Try again" kind="primary" onPress={() => void refreshMe()} />
        <Button label="Sign out" kind="quiet" onPress={() => void signOut()} />
      </Screen>
    );
  }
  if (me === null) {
    return (
      <Screen>
        <Busy />
      </Screen>
    );
  }
  return <Redirect href={firstUnfinishedStep(me) ?? "/today"} />;
}
