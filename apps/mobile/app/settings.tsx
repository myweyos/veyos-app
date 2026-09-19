/**
 * Settings: consents, Health Connect, sign out, delete account (SCRUM-76 AC, SCRUM-116).
 *
 * Deleting the account erases everything the server holds for it and then the auth account,
 * and clears what this device holds (cycle settings, sync progress, declines).
 */
import { router } from "expo-router";
import { useState } from "react";
import { Alert } from "react-native";

import { Back, Busy, ErrorLine, Screen, Sub, Title, ToggleRow } from "../src/components/form";
import { Button, Card } from "../src/components/primitives";
import { api, type Purpose } from "../src/lib/api";
import { clearCycle } from "../src/lib/cycle";
import { openHealthConnectSettings } from "../src/lib/healthConnect";
import { CONSENT_COPY_VERSION } from "../src/lib/onboarding";
import { resetSync } from "../src/lib/sync";
import { useSession } from "../src/state/session";
import { forgetDeclines } from "../src/state/today";

const OPTIONAL: Array<{ purpose: Exclude<Purpose, "health_data">; title: string; detail: string }> = [
  { purpose: "cycle_data", title: "Cycle data", detail: "Off = no cycle-based guidance." },
  { purpose: "lab_results", title: "Lab results", detail: "Off = lab layer inactive." },
  { purpose: "location_environment", title: "Location & environment", detail: "Off = no environmental guidance." },
  { purpose: "notifications", title: "Notifications", detail: "Off = guidance only when you open the app." },
  { purpose: "product_analytics", title: "Product analytics", detail: "Never affects your guidance." },
];

export default function Settings() {
  const { me, refreshMe, signOut } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setConsent = async (purpose: Purpose, granted: boolean) => {
    setError(null);
    try {
      await api.recordConsents({ [purpose]: granted }, CONSENT_COPY_VERSION);
      await refreshMe();
    } catch {
      setError("Couldn’t save that change.");
    }
  };

  const eraseEverything = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.deleteAccount();
      await Promise.all([clearCycle(), resetSync(), forgetDeclines()]);
      await signOut();
      if (!result.auth_account_deleted) {
        Alert.alert(
          "Your data is erased",
          "Everything Weyos held about your health is gone. Your sign-in could not be removed automatically; contact support to finish closing it.",
        );
      }
      router.replace("/welcome");
    } catch {
      setError("Couldn’t delete the account. Nothing was changed; try again.");
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = () =>
    Alert.alert(
      "Delete your account?",
      "This erases every reading, decision and consent Weyos holds for you. It can’t be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete everything", style: "destructive", onPress: () => void eraseEverything() },
      ],
    );

  return (
    <Screen>
      <Back onPress={() => router.back()} />
      <Title text="Settings" />
      <Sub text="What Weyos may use. Health data is required for the app to work." />
      <Card>
        <ToggleRow title="Health & biometric data" detail="Required." value locked />
        {OPTIONAL.map((o) => (
          <ToggleRow
            key={o.purpose}
            title={o.title}
            detail={o.detail}
            value={me?.consents[o.purpose] ?? false}
            onChange={(v) => void setConsent(o.purpose, v)}
          />
        ))}
      </Card>
      <Button label="Health Connect permissions" kind="secondary" onPress={() => openHealthConnectSettings()} />
      <ErrorLine text={error} />
      <Button label="Sign out" kind="quiet" onPress={() => void signOut().then(() => router.replace("/welcome"))} />
      {busy ? <Busy /> : <Button label="Delete my account" kind="quiet" onPress={confirmDelete} />}
    </Screen>
  );
}
