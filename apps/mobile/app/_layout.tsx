import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { SessionProvider } from "../src/state/session";
import { TodayProvider } from "../src/state/today";
import { color } from "../src/theme/tokens";

export default function RootLayout() {
  return (
    <SessionProvider>
      <TodayProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.cream } }} />
      </TodayProvider>
    </SessionProvider>
  );
}
