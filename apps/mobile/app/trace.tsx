/** C3 — "Why this?", for today's stored decision. */
import { Redirect, router } from "expo-router";
import { useEffect, useState } from "react";
import { SafeAreaView } from "react-native";

import { loadCycle } from "../src/lib/cycle";
import { Trace } from "../src/screens/Trace";
import { useSession } from "../src/state/session";
import { useToday } from "../src/state/today";
import { color } from "../src/theme/tokens";

export default function TraceRoute() {
  const { model } = useToday();
  const { me } = useSession();
  const [tracksCycle, setTracksCycle] = useState(false);

  useEffect(() => {
    void loadCycle().then((c) => setTracksCycle((me?.consents.cycle_data ?? false) && c.tracking));
  }, [me?.consents.cycle_data]);

  if (model === null) return <Redirect href="/today" />;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.cream }}>
      <Trace model={model} tracksCycle={tracksCycle} onBack={() => router.back()} />
    </SafeAreaView>
  );
}
