/**
 * A2 — Create account / sign in, by emailed one-time code (Supabase Auth, SCRUM-76).
 *
 * Email first because it needs no store enrolment. Sign in with Apple (mandatory on iOS once any
 * third-party sign-in ships) waits on Apple Developer enrolment (SCRUM-23); Google needs an OAuth
 * client configured in Supabase. Neither is shown until it works: no buttons that go nowhere.
 *
 * The Supabase project's email template must include {{ .Token }} for a code to be sent.
 */
import { router } from "expo-router";
import { useState } from "react";

import { Back, Busy, Caption, ErrorLine, Field, Screen, StepDots, Sub, Title } from "../src/components/form";
import { Button } from "../src/components/primitives";
import { supabase } from "../src/lib/supabase";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    const address = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setError("That doesn’t look like an email address.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: failure } = await supabase!.auth.signInWithOtp({
      email: address,
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (failure !== null) setError("Couldn’t send a code. Check the address and try again.");
    else setSentTo(address);
  };

  const verify = async () => {
    if (sentTo === null) return;
    setBusy(true);
    setError(null);
    const { error: failure } = await supabase!.auth.verifyOtp({
      email: sentTo,
      token: code.trim(),
      type: "email",
    });
    setBusy(false);
    if (failure !== null) setError("That code didn’t work. Codes expire after a few minutes.");
    else router.replace("/");
  };

  if (sentTo === null) {
    return (
      <Screen>
        <Title text="Create your account" />
        <Sub text="One account, on every device you use." />
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        <ErrorLine text={error} />
        {busy ? <Busy /> : <Button label="Continue with email" kind="primary" onPress={() => void send()} />}
        <Caption text="By continuing you agree to our terms. We’ll ask separately, and explicitly, before touching any health data." />
        <StepDots step={2} of={5} />
        <Back onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Title text="Check your email" />
      <Sub text={`We sent a code to ${sentTo}. Enter it here.`} />
      <Field
        label="Code"
        value={code}
        onChangeText={setCode}
        placeholder="123456"
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={10}
      />
      <ErrorLine text={error} />
      {busy ? <Busy /> : <Button label="Continue" kind="primary" onPress={() => void verify()} />}
      <Button label="Use a different email" kind="quiet" onPress={() => setSentTo(null)} />
    </Screen>
  );
}
