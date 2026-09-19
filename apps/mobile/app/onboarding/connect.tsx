/**
 * A10 — Connect your signals (Health Connect, SCRUM-65/47).
 *
 * Asks for read access, then backfills up to 30 days so the baseline can form now rather than
 * in a month. What Weyos reads is listed before the system prompt appears, and "Nothing is
 * written back" is true: only read permissions are requested.
 *
 * The pack's chest-strap row isn't shown: Bluetooth isn't built yet (VEY-SENSOR-2), and a
 * button that pairs nothing is exactly what CLAUDE.md non-negotiable 9 rules out.
 */
import { router } from "expo-router";
import { useEffect, useState } from "react";

import { Back, Busy, Caption, ErrorLine, Screen, Sub, Title } from "../../src/components/form";
import { Button, Card, Note } from "../../src/components/primitives";
import { loadCycle } from "../../src/lib/cycle";
import { availability, connect, openHealthConnectSettings, type Availability } from "../../src/lib/healthConnect";
import { sync } from "../../src/lib/sync";
import { useSession } from "../../src/state/session";

export default function ConnectStep() {
  const { me } = useSession();
  const [status, setStatus] = useState<Availability | "checking">("checking");
  const [phase, setPhase] = useState<"idle" | "asking" | "reading">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void availability().then(setStatus, () => setStatus("unavailable"));
  }, []);

  const run = async () => {
    setError(null);
    setPhase("asking");
    try {
      const cycleConsent = me?.consents.cycle_data ?? false;
      const cycle = await loadCycle();
      const granted = await connect(cycleConsent && cycle.tracking);
      if (granted.size === 0) {
        setPhase("idle");
        setError("No access was granted. You can allow it in Health Connect’s settings.");
        return;
      }
      setPhase("reading");
      await sync({ cycleConsent });
      router.replace("/onboarding/learning");
    } catch {
      setPhase("idle");
      setError("Couldn’t read from Health Connect or reach Weyos. Try again in a moment.");
    }
  };

  if (status === "checking") {
    return (
      <Screen>
        <Busy />
      </Screen>
    );
  }

  if (status === "not_android") {
    return (
      <Screen>
        <Title text="Connect your signals" />
        <Sub text="Apple Health isn’t supported in this build yet. Weyos reads Health Connect on Android today." />
        <Button label="Continue" kind="primary" onPress={() => router.replace("/onboarding/learning")} />
      </Screen>
    );
  }

  if (status !== "available") {
    return (
      <Screen>
        <Title text="Health Connect is needed" />
        <Sub
          text={
            status === "update_required"
              ? "Health Connect needs an update before Weyos can read from it."
              : "Weyos reads your signals through Health Connect, which isn’t available on this phone yet. Install it from the Play Store, then come back."
          }
        />
        <Button label="Open Health Connect" kind="primary" onPress={() => openHealthConnectSettings()} />
        <Button label="Check again" kind="quiet" onPress={() => void availability().then(setStatus)} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Title text="Connect your signals" />
      <Sub text="Weyos reads from what you already wear. Nothing is written back." />
      <Card>
        <Sub text="Health Connect: HRV, resting heart rate, sleep stages and steps, plus period dates if you shared cycle data." />
      </Card>
      <Note text="Worth knowing: a smartwatch gives Weyos your data in batches, not live. Weyos works well either way." />
      <ErrorLine text={error} />
      {phase === "idle" && <Button label="Connect Health Connect" kind="primary" onPress={() => void run()} />}
      {phase === "asking" && <Busy />}
      {phase === "reading" && (
        <>
          <Busy />
          <Caption text="Reading your last 30 days so Weyos can learn your baseline now rather than in a month." />
        </>
      )}
      <Button label="Not now" kind="quiet" onPress={() => router.replace("/onboarding/learning")} />
      <Back onPress={() => router.back()} />
    </Screen>
  );
}
