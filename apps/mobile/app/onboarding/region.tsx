/** A3 — Region. Copy from the design pack. Sets the privacy regime and units. */
import { router } from "expo-router";
import { useState } from "react";

import { Back, Busy, Choice, ErrorLine, Screen, StepDots, Sub, Title } from "../../src/components/form";
import { Button, Note } from "../../src/components/primitives";
import { api, type Region } from "../../src/lib/api";
import { useSession } from "../../src/state/session";

export default function RegionStep() {
  const { me, refreshMe } = useSession();
  const [region, setRegion] = useState<Region | null>(me?.region ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = async () => {
    if (region === null) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateProfile({ region });
      await refreshMe();
      router.push("/onboarding/consent");
    } catch {
      setError("Couldn’t save that. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title text="Where are you?" />
      <Sub text="This sets which privacy law protects you, which shops Weyos suggests, and whether you see °C or °F." />
      <Choice
        title="United Kingdom"
        detail="UK GDPR · °C"
        selected={region === "UK"}
        onPress={() => setRegion("UK")}
      />
      <Choice
        title="United States"
        detail="CCPA/CPRA + state consumer-health law · °F"
        selected={region === "US"}
        onPress={() => setRegion("US")}
      />
      {/* The pack adds "Your health data is stored in your own region and does not leave it."
          Not shown until per-region storage (SCRUM-77) makes it true. */}
      <Note text="Weyos works in both markets." />
      <StepDots step={3} of={5} />
      <ErrorLine text={error} />
      {busy ? (
        <Busy />
      ) : (
        <Button label="Continue" kind="primary" onPress={region === null ? undefined : () => void next()} />
      )}
      <Back onPress={() => router.back()} />
    </Screen>
  );
}
