/**
 * A4 — Consent. Separate permissions, one per purpose, each with what turning it off costs.
 *
 * Health data is required: the app can't work without it, and "Agree and continue" is the
 * explicit, affirmative act that grants it (UK GDPR Art.9). Every other purpose starts OFF and
 * is the subject's to turn on. The design pack shows several defaulting on, but pre-ticked
 * boxes are not valid consent (Planet49), and cycle and lab data are special-category health
 * data themselves.
 *
 * Every decision is stored server-side with the copy version it was made against. The pack's
 * voice and conversation consents arrive with the agent.
 */
import { router } from "expo-router";
import { useState } from "react";

import { Back, Busy, Caption, ErrorLine, Screen, StepDots, Sub, Title, ToggleRow } from "../../src/components/form";
import { Button, Card } from "../../src/components/primitives";
import { api, type ConsentState } from "../../src/lib/api";
import { CONSENT_COPY_VERSION } from "../../src/lib/onboarding";
import { useSession } from "../../src/state/session";

type Optional = Exclude<keyof ConsentState, "health_data">;

export default function ConsentStep() {
  const { me, refreshMe } = useSession();
  const [choices, setChoices] = useState<Record<Optional, boolean>>({
    cycle_data: me?.consents.cycle_data ?? false,
    lab_results: me?.consents.lab_results ?? false,
    location_environment: me?.consents.location_environment ?? false,
    notifications: me?.consents.notifications ?? false,
    product_analytics: me?.consents.product_analytics ?? false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: Optional) => (value: boolean) => setChoices((c) => ({ ...c, [key]: value }));

  const agree = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.recordConsents({ health_data: true, ...choices }, CONSENT_COPY_VERSION);
      await refreshMe();
      router.push("/onboarding/basics");
    } catch {
      setError("Couldn’t save your choices. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title text="What Weyos may use" />
      <Sub text="Separate permissions. Turn any of them on or off now or later — you’ll always see what it costs you." />
      <Card>
        <ToggleRow
          title="Health & biometric data"
          detail="So Weyos can learn your baseline and notice changes. Required — the app can’t work without it."
          value
          locked
        />
        <ToggleRow
          title="Cycle data"
          detail="So guidance follows your cycle phase. Off = no cycle-based guidance."
          value={choices.cycle_data}
          onChange={set("cycle_data")}
        />
        <ToggleRow
          title="Lab results"
          detail="So values from a blood test can override general guidance. Off = lab layer inactive."
          value={choices.lab_results}
          onChange={set("lab_results")}
        />
        <ToggleRow
          title="Location & environment"
          detail="Local heat and season, for your area. Off = no environmental guidance."
          value={choices.location_environment}
          onChange={set("location_environment")}
        />
        <ToggleRow
          title="Notifications"
          detail="So Weyos can reach you when something changes. Off = guidance only when you open the app."
          value={choices.notifications}
          onChange={set("notifications")}
        />
        <ToggleRow
          title="Product analytics"
          detail="Helps improve Weyos. Never affects your guidance."
          value={choices.product_analytics}
          onChange={set("product_analytics")}
        />
      </Card>
      {/* The pack also says data is "encrypted and stored in your region". Not stated until it
          is true: per-region storage is SCRUM-77, and encryption at rest depends on hosting. */}
      <Caption text="Your health data is never sold, and never shared with an employer or insurer." />
      <StepDots step={4} of={5} />
      <ErrorLine text={error} />
      {busy ? <Busy /> : <Button label="Agree and continue" kind="primary" onPress={() => void agree()} />}
      <Back onPress={() => router.back()} />
    </Screen>
  );
}
