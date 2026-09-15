/**
 * A7 — Food profile. Sets the constitution Layer 3 reads (dosha, by John's decision of
 * 2026-09-14, pending plan v2 §9.2).
 *
 * The design pack says "Question 1 of 3" but specifies only question 1. That is the question
 * asked here, answer-for-answer. Questions 2 and 3 are content for the content-library owner
 * (§9.14), and inventing them in code would mean deciding the constitution model's inputs.
 */
import { router } from "expo-router";
import { useState } from "react";

import { Back, Busy, Choice, ErrorLine, Screen, Sub, Title } from "../../src/components/form";
import { Button, Note } from "../../src/components/primitives";
import { api, type Dosha } from "../../src/lib/api";
import { useSession } from "../../src/state/session";

const ANSWERS: Array<{ dosha: Dosha; text: string }> = [
  { dosha: "vata", text: "You’re cold, dry or unsettled" },
  { dosha: "pitta", text: "You’re overheated or wound up" },
  { dosha: "kapha", text: "You’re heavy, sluggish or congested" },
];

export default function FoodStep() {
  const { me, refreshMe } = useSession();
  const [dosha, setDosha] = useState<Dosha | null>(me?.constitution?.dosha ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = async () => {
    if (dosha === null) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateProfile({ constitution: { dosha } });
      await refreshMe();
      router.push("/onboarding/connect");
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
      {ANSWERS.map((a) => (
        <Choice key={a.dosha} title={a.text} selected={dosha === a.dosha} onPress={() => setDosha(a.dosha)} />
      ))}
      <Note text="A traditional constitutional model, used here for food preferences only. It sits below your live biometrics and your lab results — those always win." />
      <ErrorLine text={error} />
      {busy ? (
        <Busy />
      ) : (
        <Button label="Continue" kind="primary" onPress={dosha === null ? undefined : () => void next()} />
      )}
      <Back onPress={() => router.back()} />
    </Screen>
  );
}
