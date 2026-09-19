/**
 * Monthly waist measurement (SCRUM-99). Quiet, skippable, charted without a verdict.
 *
 * Waist is the primary outcome metric, so the history is shown as plain numbers with dates.
 * No threshold, no target, no arrow: the pack is explicit that H1 charts it "without a
 * verdict or threshold attached".
 */
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Back, Busy, ErrorLine, Field, Screen, Sub, Title } from "../src/components/form";
import { Button, Card, Note } from "../src/components/primitives";
import { api } from "../src/lib/api";
import { useSession } from "../src/state/session";
import { color } from "../src/theme/tokens";

export default function WaistRoute() {
  const { refreshMe } = useSession();
  const [history, setHistory] = useState<Array<{ measured_on: string; waist_cm: number }> | null>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.waistHistory().then(setHistory, () => setHistory([]));
  }, []);

  const save = async () => {
    const n = Number(value.trim());
    if (!Number.isFinite(n) || n < 40 || n > 200) {
      setError("Enter your waist in centimetres, between 40 and 200.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.updateIdentity({ waist_cm: Math.round(n * 10) / 10 });
      await refreshMe();
      router.back();
    } catch {
      setError("Couldn’t save that. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Back onPress={() => router.back()} />
      <Title text="Your waist, this month" />
      <Sub text="Once a month, measured the same way each time. This is the one number Weyos keeps over time." />
      <Note text="How to measure: stand relaxed, breathe out normally, and run a tape around your middle at the level of your navel, snug but not tight." />
      <Field label="Waist at the navel (cm)" value={value} onChangeText={setValue} placeholder="92" keyboardType="numeric" />
      <ErrorLine text={error} />
      {busy ? <Busy /> : <Button label="Save" kind="primary" onPress={() => void save()} />}
      <Button label="Not now" kind="quiet" onPress={() => router.back()} />

      {history === null ? (
        <Busy />
      ) : history.length > 0 ? (
        <Card>
          <Text style={s.head}>So far</Text>
          {history.map((h) => (
            <View key={`${h.measured_on}-${h.waist_cm}`} style={s.row}>
              <Text style={s.date}>{h.measured_on}</Text>
              <Text style={s.val}>{h.waist_cm} cm</Text>
            </View>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  head: { fontSize: 12.5, fontWeight: "600", color: color.muted, marginBottom: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  date: { fontSize: 14.5, color: color.muted },
  val: { fontSize: 14.5, color: color.ink, fontWeight: "600" },
});
