/**
 * A7, part two — Your baseline (Module J, SCRUM-89/90/93).
 *
 * Eleven observations about rhythm, appetite and recovery, scored server-side into six
 * internal axes, read back as plain sentences. The person sees the sentences and nothing
 * else: no type, no score, no percentage, no axis name.
 *
 * Under every sentence sits "that doesn't sound like me". It re-asks the question behind
 * that line and records the correction against it.
 */
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Back, Busy, Caption, ErrorLine, Screen, Sub, Title } from "../../src/components/form";
import { Button, Card, Link } from "../../src/components/primitives";
import { DipQuestion, OptionsQuestion, ScaleQuestion } from "../../src/components/questionnaire";
import { ApiError, api, type BaselineView, type Instrument } from "../../src/lib/api";
import { color } from "../../src/theme/tokens";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Which question to re-ask when a sentence doesn't sound right. Keys are internal ids. */
const REASK: Record<string, string[]> = {
  T1: ["J2b"],
  T2: ["J5", "J3"],
  T3: ["J4a", "J4b", "J1"],
  T4: ["J6", "J3"],
  T5: ["J7", "J1"],
  T6: ["J8a", "J2a"],
  "T1+T2": ["J2b", "J5"],
};

export default function BaselineStep() {
  const [instrument, setInstrument] = useState<Instrument | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [dip, setDip] = useState<string | null | undefined>(undefined);
  const [result, setResult] = useState<BaselineView | null>(null);
  const [reasking, setReasking] = useState<{ key: string; items: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.instrument().then(setInstrument, () => setError("Couldn’t load the questions."));
  }, []);

  if (instrument === null) {
    return (
      <Screen>
        <ErrorLine text={error} />
        <Busy />
      </Screen>
    );
  }

  const scoredIds = instrument.items.filter((i) => i.type !== "time_or_none").map((i) => i.id);
  const answered = scoredIds.filter((id) => answers[id] !== undefined).length;
  const complete = answered === scoredIds.length && dip !== undefined && (dip === null || TIME.test(dip));

  const submit = async (correctedFragment?: string) => {
    setBusy(true);
    setError(null);
    try {
      const view = await api.submitBaseline({
        answers,
        energy_dip_at: dip ?? null,
        ...(correctedFragment !== undefined && { corrected_fragment: correctedFragment }),
      });
      setResult(view);
      setReasking(null);
    } catch (e) {
      setError(
        e instanceof ApiError && e.code === "invalid_energy_dip"
          ? "Enter the time as HH:MM, for example 13:00."
          : "Couldn’t save your answers. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const render = (id: string) => {
    const item = instrument.items.find((i) => i.id === id);
    if (item === undefined) return null;
    if (item.type === "time_or_none") return <DipQuestion key={id} item={item} value={dip} onChange={setDip} />;
    const props = { item, value: answers[id], onChange: (v: number) => setAnswers((a) => ({ ...a, [id]: v })) };
    return item.type === "scale" ? <ScaleQuestion key={id} {...props} /> : <OptionsQuestion key={id} {...props} />;
  };

  // Correction mode: re-ask only the questions behind the sentence that was wrong.
  if (result !== null && reasking !== null) {
    return (
      <Screen>
        <Title text="Let’s ask that again" />
        <Sub text="Pick the answer closest to an ordinary week, not your best one." />
        {reasking.items.map(render)}
        <ErrorLine text={error} />
        {busy ? <Busy /> : <Button label="Update" kind="primary" onPress={() => void submit(reasking.key)} />}
        <Button label="Keep it as it was" kind="quiet" onPress={() => setReasking(null)} />
      </Screen>
    );
  }

  if (result !== null) {
    return (
      <Screen>
        <Title text="What we’d say about you" />
        <Sub text="In your own terms." />
        {result.fragments.length === 0 ? (
          <Card flat>
            <Text style={s.frag}>Your answers sit close to the middle on everything, so there’s nothing distinctive to say yet.</Text>
          </Card>
        ) : (
          result.fragments.map((f) => (
            <Card key={f.key} flat>
              <Text style={s.frag}>{f.text}</Text>
              <Link
                text="That doesn’t sound like me"
                onPress={() => setReasking({ key: f.key, items: REASK[f.key] ?? [] })}
              />
            </Card>
          ))
        )}
        <Caption text="This is a description of what you told us, not an assessment of your health. Weyos gets more accurate once it can see your sleep and activity data — until then this is your own account of yourself, and nothing more." />
        <Button label="Continue" kind="primary" onPress={() => router.push("/onboarding/connect")} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Title text="Your baseline" />
      <Sub text="Eight observations about your rhythm, your appetite and how you recover, turned into a plain description of you that you’ll either recognise or correct." />
      <Sub text="There’s no right answer and no better answer. Pick the one that’s closest to an ordinary week, not your best one." />
      <View>{instrument.items.map((i) => render(i.id))}</View>
      <Caption text={`${answered} / ${scoredIds.length} answered`} />
      <ErrorLine text={error} />
      {busy ? (
        <Busy />
      ) : (
        <Button label="See my description" kind="primary" onPress={complete ? () => void submit() : undefined} />
      )}
      <Back onPress={() => router.back()} />
    </Screen>
  );
}

const s = StyleSheet.create({
  frag: { fontSize: 20, lineHeight: 29, color: color.ink, marginBottom: 6 },
});
