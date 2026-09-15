import "react-native-url-polyfill/auto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppState } from "react-native";

import { config } from "./config";
import { secureStorage } from "./secureStorage";

/**
 * The Supabase Auth client (SCRUM-76). Used for sign-in and the session only.
 *
 * All data goes through the Weyos API, never Supabase's database APIs. The anon key is public
 * by design and grants nothing beyond signing in.
 */
export const supabase: SupabaseClient | null =
  config === null
    ? null
    : createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: {
          storage: secureStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      });

// Refresh tokens only while the app is in the foreground, as Supabase recommends for React
// Native. Background refresh timers don't survive the OS suspending the app anyway.
if (supabase !== null) {
  AppState.addEventListener("change", (state) => {
    if (state === "active") void supabase.auth.startAutoRefresh();
    else void supabase.auth.stopAutoRefresh();
  });
}
