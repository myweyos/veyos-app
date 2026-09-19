import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { ApiError, api, type Me } from "../lib/api";
import { supabase } from "../lib/supabase";

export type SessionStatus = "loading" | "not_configured" | "signed_out" | "signed_in";

interface SessionValue {
  status: SessionStatus;
  session: Session | null;
  /** The account's onboarding answers and consents. Null until loaded or when signed out. */
  me: Me | null;
  /** Set when /v1/me couldn't be reached. Screens show it; nothing pretends to be loaded. */
  meError: string | null;
  refreshMe: () => Promise<Me | null>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<SessionStatus>(supabase === null ? "not_configured" : "loading");
  const [me, setMe] = useState<Me | null>(null);
  const [meError, setMeError] = useState<string | null>(null);

  const refreshMe = useCallback(async (): Promise<Me | null> => {
    try {
      const next = await api.me();
      setMe(next);
      setMeError(null);
      return next;
    } catch (error) {
      setMeError(error instanceof ApiError ? error.code : "network_error");
      return null;
    }
  }, []);

  useEffect(() => {
    if (supabase === null) return;
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setStatus(data.session === null ? "signed_out" : "signed_in");
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setStatus(next === null ? "signed_out" : "signed_in");
      if (next === null) setMe(null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (status === "signed_in") void refreshMe();
  }, [status, refreshMe]);

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
    setMe(null);
  }, []);

  const value = useMemo(
    () => ({ status, session, me, meError, refreshMe, signOut }),
    [status, session, me, meError, refreshMe, signOut],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (value === null) throw new Error("useSession outside SessionProvider");
  return value;
}
