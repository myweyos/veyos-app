import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { ApiError, api } from "../lib/api";
import { deviceStore } from "../lib/deviceStore";
import { availability, grantedTypes } from "../lib/healthConnect";
import { sync } from "../lib/sync";
import { buildToday, type TodayModel } from "../lib/todayModel";
import { useSession } from "./session";

export type TodayStatus = "idle" | "loading" | "ready" | "no_data" | "error";

interface TodayValue {
  status: TodayStatus;
  model: TodayModel | null;
  error: string | null;
  /** Read Health Connect (if connected), send new days, then load the stored decision. */
  refresh: () => Promise<void>;
  /** Record "Not for me" on today's decision. */
  decline: () => Promise<void>;
}

const TodayContext = createContext<TodayValue | null>(null);

// Declines are kept on the device for now. The design has them as an event keyed by
// decision_id on the server (app-states.json, `declined`); until that endpoint exists, this is
// the one piece of state the app holds that the API doesn't.
const DECLINED_KEY = "weyos.declined.v1";

async function declinedIds(): Promise<string[]> {
  try {
    return JSON.parse((await deviceStore.getItem(DECLINED_KEY)) ?? "[]") as string[];
  } catch {
    return [];
  }
}

export function TodayProvider({ children }: { children: ReactNode }) {
  const { me } = useSession();
  const [status, setStatus] = useState<TodayStatus>("idle");
  const [model, setModel] = useState<TodayModel | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [envelope, signals, rulebook, declined] = await Promise.all([
      api.today(),
      api.signals(),
      api.rulebook(),
      declinedIds(),
    ]);
    const snapshot = signals.snapshot === null ? null : { ...signals.snapshot, baselines: signals.baselines ?? undefined };
    const client = declined.includes(envelope.decision_id) ? { user_response: "declined" as const } : {};
    setModel(buildToday(envelope, snapshot, rulebook, client));
    setStatus("ready");
  }, []);

  const refresh = useCallback(async () => {
    setStatus((s) => (s === "ready" ? s : "loading"));
    setError(null);
    try {
      if ((await availability()) === "available" && (await grantedTypes()).size > 0) {
        await sync({ cycleConsent: me?.consents.cycle_data ?? false });
      }
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.code === "no_decision_yet") {
        setModel(null);
        setStatus("no_data");
        return;
      }
      setError(e instanceof ApiError ? e.code : "network_error");
      setStatus("error");
    }
  }, [load, me?.consents.cycle_data]);

  const decline = useCallback(async () => {
    if (model === null) return;
    const ids = await declinedIds();
    const next = [...ids.filter((id) => id !== model.envelope.decision_id), model.envelope.decision_id].slice(-60);
    await deviceStore.setItem(DECLINED_KEY, JSON.stringify(next));
    await load();
  }, [model, load]);

  const value = useMemo(() => ({ status, model, error, refresh, decline }), [status, model, error, refresh, decline]);
  return <TodayContext.Provider value={value}>{children}</TodayContext.Provider>;
}

export function useToday(): TodayValue {
  const value = useContext(TodayContext);
  if (value === null) throw new Error("useToday outside TodayProvider");
  return value;
}

export async function forgetDeclines(): Promise<void> {
  await deviceStore.deleteItem(DECLINED_KEY);
}
