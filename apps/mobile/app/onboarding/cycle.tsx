/**
 * A6 — Cycle setup. Optional: skipping it turns off cycle guidance, nothing else.
 *
 * Kept on the device in encrypted storage. If Health Connect has period records and the
 * subject grants access, a later start date from there replaces this one.
 */
import { router } from "expo-router";
import { useState } from "react";

import { Back, ErrorLine, Field, Screen, Sub, Title } from "../../src/components/form";
import { Button, Note } from "../../src/components/primitives";
import { saveCycle } from "../../src/lib/cycle";
import { localDate } from "../../src/lib/dates";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export default function CycleStep() {
  const [start, setStart] = useState("");
  const [length, setLength] = useState("");
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const trimmed = start.trim();
    if (!ISO.test(trimmed) || Number.isNaN(Date.parse(trimmed)) || trimmed > localDate()) {
      setError("Enter the date as YYYY-MM-DD, and not in the future.");
      return;
    }
    const days = length.trim() === "" ? null : Number(length);
    if (days !== null && (!Number.isInteger(days) || days < 20 || days > 45)) {
      setError("Typical length is a whole number of days between 20 and 45, or leave it blank.");
      return;
    }
    await saveCycle({ tracking: true, lastPeriodStart: trimmed, cycleLength: days });
    router.push("/onboarding/food");
  };

  const skip = async () => {
    await saveCycle({ tracking: false, lastPeriodStart: null, cycleLength: null });
    router.push("/onboarding/food");
  };

  return (
    <Screen>
      <Title text="Your cycle" />
      <Sub text="Weyos changes what it asks of you across the month. Two questions is enough to start." />
      <Field
        label="First day of your last period (YYYY-MM-DD)"
        value={start}
        onChangeText={setStart}
        placeholder={localDate()}
        keyboardType="numbers-and-punctuation"
      />
      <Field
        label="Typical cycle length in days (optional)"
        value={length}
        onChangeText={setLength}
        placeholder="28"
        keyboardType="number-pad"
        maxLength={2}
      />
      <Note text="If you’d rather not share this, skip it. You’ll keep everything else — you’ll just lose the cycle-phase guidance." />
      <ErrorLine text={error} />
      <Button label="Continue" kind="primary" onPress={() => void save()} />
      <Button label="Skip this" kind="quiet" onPress={() => void skip()} />
      <Back onPress={() => router.back()} />
    </Screen>
  );
}
