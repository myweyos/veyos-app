/**
 * A5 — A little about you (Module A, SCRUM-95).
 *
 * Every question here has a named downstream use, recorded on the column in migration 0007.
 * Nothing the wearable can answer is asked. Waist is the primary outcome metric, so it comes
 * with instructions on how to measure it, and it's re-asked monthly (SCRUM-99).
 *
 * All of it is optional. Skipping leaves the fields empty; nothing is degraded.
 */
import { router } from "expo-router";
import { useEffect, useState } from "react";

import { Back, Busy, Choice, ErrorLine, Field, Screen, Sub, Title } from "../../src/components/form";
import { Button, Note } from "../../src/components/primitives";
import { api, type IdentityAnswers } from "../../src/lib/api";
import { useSession } from "../../src/state/session";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const FIXED_START: Array<{ value: NonNullable<IdentityAnswers["fixed_start"]>; text: string }> = [
  { value: "no", text: "No — I wake when I wake" },
  { value: "some", text: "Some days" },
  { value: "yes", text: "Yes, most days" },
];
const WORK: Array<{ value: NonNullable<IdentityAnswers["work_pattern"]>; text: string }> = [
  { value: "fixed", text: "Fixed hours" },
  { value: "flexible", text: "Flexible" },
  { value: "shift", text: "Shift work" },
  { value: "self-directed", text: "I set my own" },
];

export default function BasicsStep() {
  const { me } = useSession();
  const [dob, setDob] = useState("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [waist, setWaist] = useState("");
  const [wake, setWake] = useState("");
  const [sleep, setSleep] = useState("");
  const [fixedStart, setFixedStart] = useState<IdentityAnswers["fixed_start"]>(null);
  const [work, setWork] = useState<IdentityAnswers["work_pattern"]>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.identity().then((id) => {
      setDob(id.date_of_birth ?? "");
      setHeight(id.height_cm === null ? "" : String(id.height_cm));
      setWeight(id.weight_kg === null ? "" : String(id.weight_kg));
      setWaist(id.waist_cm === null ? "" : String(id.waist_cm));
      setWake(id.usual_wake_time?.slice(0, 5) ?? "");
      setSleep(id.usual_sleep_time?.slice(0, 5) ?? "");
      setFixedStart(id.fixed_start);
      setWork(id.work_pattern);
    }, () => undefined);
  }, []);

  const nextRoute = me?.consents.cycle_data ? "/onboarding/cycle" : "/onboarding/food";

  const num = (raw: string): number | null | "bad" => {
    const t = raw.trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : "bad";
  };

  const save = async () => {
    const h = num(height), w = num(weight), wc = num(waist);
    if (h === "bad" || w === "bad" || wc === "bad") { setError("Height, weight and waist are numbers."); return; }
    if (dob.trim() !== "" && !DATE.test(dob.trim())) { setError("Date of birth: use YYYY-MM-DD."); return; }
    if (wake.trim() !== "" && !TIME.test(wake.trim())) { setError("Wake time: use HH:MM."); return; }
    if (sleep.trim() !== "" && !TIME.test(sleep.trim())) { setError("Sleep time: use HH:MM."); return; }
    setBusy(true);
    setError(null);
    try {
      await api.updateIdentity({
        date_of_birth: dob.trim() || null,
        height_cm: h,
        weight_kg: w,
        waist_cm: wc,
        usual_wake_time: wake.trim() || null,
        usual_sleep_time: sleep.trim() || null,
        fixed_start: fixedStart,
        work_pattern: work,
      });
      router.push(nextRoute);
    } catch {
      setError("Couldn’t save that. Check the values are in range and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title text="A little about you" />
      <Sub text="Weyos uses these to pick which rules can apply to you at all. Everything here is optional, and nothing here is something your watch already knows." />
      <Field label="Date of birth (YYYY-MM-DD)" value={dob} onChangeText={setDob} placeholder="1985-12-10" keyboardType="numbers-and-punctuation" />
      <Field label="Height (cm)" value={height} onChangeText={setHeight} placeholder="178" keyboardType="numeric" />
      <Field label="Weight (kg)" value={weight} onChangeText={setWeight} placeholder="80" keyboardType="numeric" />
      <Field label="Waist at the navel (cm)" value={waist} onChangeText={setWaist} placeholder="92" keyboardType="numeric" />
      <Note text="How to measure: stand relaxed, breathe out normally, and run a tape around your middle at the level of your navel, snug but not tight. This is the one number Weyos tracks over time, so measure it the same way each month." />
      <Field label="Usual wake time (HH:MM)" value={wake} onChangeText={setWake} placeholder="07:00" keyboardType="numbers-and-punctuation" />
      <Field label="Usual sleep time (HH:MM)" value={sleep} onChangeText={setSleep} placeholder="23:00" keyboardType="numbers-and-punctuation" />
      <Sub text="Is there a time you have to be up for?" />
      {FIXED_START.map((o) => (
        <Choice key={o.value} title={o.text} selected={fixedStart === o.value} onPress={() => setFixedStart(o.value)} />
      ))}
      <Sub text="How would you describe your working week?" />
      {WORK.map((o) => (
        <Choice key={o.value} title={o.text} selected={work === o.value} onPress={() => setWork(o.value)} />
      ))}
      <Note text="Your wake and sleep times set the window Weyos would ever contact you in. Nothing else is done with them." />
      <ErrorLine text={error} />
      {busy ? <Busy /> : <Button label="Continue" kind="primary" onPress={() => void save()} />}
      <Button label="Skip for now" kind="quiet" onPress={() => router.push(nextRoute)} />
      <Back onPress={() => router.back()} />
    </Screen>
  );
}
