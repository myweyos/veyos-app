/**
 * A7, part one — Food profile. The one question the design pack specifies.
 *
 * The client sends the answer's position (1–3); what the engine makes of it stays on the
 * server, so no type label exists on the device (SCRUM-91). This question goes when Layer 3
 * reads the six trait axes instead (SCRUM-92); the baseline questions that follow (A7 part two)
 * are what replace it.
 */
import { router } from "expo-router";
import { useState } from "react";

import { Back, Busy, Choice, ErrorLine, Screen, Sub, Title } from "../../src/components/form";
import { Button, Note } from "../../src/components/primitives";
import { api } from "../../src/lib/api";
import { useSession } from "../../src/state/session";

const ANSWERS = [
  "You’re cold, dry or unsettled",
  "You’re overheated or wound up",
  "You’re heavy, sluggish or congested",
] as const;

export default function FoodStep() {
  const { refreshMe } = useSession();
  const [answer, setAnswer] = useState<1 | 2 | 3 | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = async () => {
    if (answer === null) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateProfile({ constitution: { answer } });
      await refreshMe();
      router.push("/onboarding/baseline");
    } catch {
      setError("Couldn’t save that. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title text="Your food profile" />
      <Sub text="This sets a persistent food baseline that works from today, while Weyos learns your biometrics." />
      <Sub text="In general, you feel worse when…" />
      {ANSWERS.map((text, i) => (
        <Choice
          key={text}
          title={text}
          selected={answer === i + 1}
          onPress={() => setAnswer((i + 1) as 1 | 2 | 3)}
        />
      ))}
      <Note text="A traditional constitutional model, used here for food preferences only. It sits below your live biometrics and your lab results — those always win." />
      <ErrorLine text={error} />
      {busy ? (
        <Busy />
      ) : (
        <Button label="Continue" kind="primary" onPress={answer === null ? undefined : () => void next()} />
      )}
      <Back onPress={() => router.back()} />
    </Screen>
  );
}
