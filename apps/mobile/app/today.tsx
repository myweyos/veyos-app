/**
 * Today (B1–B6), on the subject's real stored decision.
 *
 * Pull to refresh reads Health Connect, sends any new days, and reloads the decision the
 * engine made at ingest. Nothing is computed here: the verdict, the plan and the food are the
 * engine's, and the app state is @weyos/app-state's derivation of them.
 */
import { Redirect, router, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { RefreshControl, SafeAreaView, StyleSheet, Text, View } from "react-native";

import { Busy, Screen, Sub, Title } from "../src/components/form";
import { Button, Link } from "../src/components/primitives";
import { TodayPrompts } from "../src/components/prompts";
import { firstUnfinishedStep } from "../src/lib/onboarding";
import { Today } from "../src/screens/Today";
import { useSession } from "../src/state/session";
import { useToday } from "../src/state/today";
import { color } from "../src/theme/tokens";

const FRIENDLY: Record<string, string> = {
  consent_required: "Weyos needs your consent to use health data before it can decide anything.",
  profile_incomplete: "Finish your food profile so Weyos can decide.",
  engine_unavailable: "Weyos couldn’t reach its decision engine. Nothing is being guessed in the meantime.",
  network_error: "Weyos can’t reach its server right now.",
};

export default function TodayRoute() {
  const { status: session, me } = useSession();
  const { status, model, error, refresh } = useToday();

  useFocusEffect(
    useCallback(() => {
      if (status === "idle") void refresh();
    }, [status, refresh]),
  );

  if (session === "signed_out") return <Redirect href="/welcome" />;
  const unfinished = me === null ? null : firstUnfinishedStep(me);
  if (unfinished !== null) return <Redirect href={unfinished} />;

  const header = (
    <View style={s.header}>
      <Link text="Settings" onPress={() => router.push("/settings")} />
    </View>
  );

  if (status === "idle" || status === "loading") {
    return (
      <Screen>
        {header}
        <Busy />
      </Screen>
    );
  }

  if (status === "no_data") {
    return (
      <Screen>
        {header}
        <Title text="No readings yet" />
        <Sub text="Weyos decides from your own signals. Connect Health Connect, or wait for your watch to sync, then pull down to refresh." />
        <Button label="Connect your signals" kind="primary" onPress={() => router.push("/onboarding/connect")} />
        <Button label="Refresh" kind="quiet" onPress={() => void refresh()} />
      </Screen>
    );
  }

  if (status === "error" || model === null) {
    return (
      <Screen>
        {header}
        <Title text="Today isn’t available" />
        <Sub text={FRIENDLY[error ?? ""] ?? "Something went wrong loading today’s decision."} />
        <Button label="Try again" kind="primary" onPress={() => void refresh()} />
      </Screen>
    );
  }

  return (
    <SafeAreaView style={s.root}>
      <Today
        model={model}
        header={header}
        footer={<TodayPrompts me={me} />}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={() => void refresh()} tintColor={color.accent} />
        }
        onWhyThis={() => router.push("/trace")}
        onTakeover={() => router.push("/takeover")}
      />
      {model.appState === "intervention" && (
        <Text accessibilityRole="button" onPress={() => router.push("/takeover")} style={s.footer}>
          Open the takeover ›
        </Text>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.cream },
  header: { flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: 20, paddingTop: 12 },
  footer: { textAlign: "center", padding: 14, color: color.accent, fontWeight: "600", fontSize: 14.5 },
});
