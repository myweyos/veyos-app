/** C2 — the takeover, for today's stored decision. "Not for me" records a decline. */
import { Redirect, router } from "expo-router";
import { SafeAreaView } from "react-native";

import { Takeover } from "../src/screens/Takeover";
import { useToday } from "../src/state/today";
import { color } from "../src/theme/tokens";

export default function TakeoverRoute() {
  const { model, decline } = useToday();
  if (model === null) return <Redirect href="/today" />;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.cream }}>
      <Takeover
        model={model}
        onWhyThis={() => router.push("/trace")}
        onDismiss={() => router.back()}
        onDecline={() => void decline().then(() => router.back())}
      />
    </SafeAreaView>
  );
}
