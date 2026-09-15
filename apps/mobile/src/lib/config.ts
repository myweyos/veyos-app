/**
 * Build-time configuration, from EXPO_PUBLIC_* variables set per profile in eas.json.
 *
 * Each variable is referenced literally because Expo inlines `process.env.EXPO_PUBLIC_X` at
 * build time and can't see a dynamic lookup. A build missing any of them shows a
 * configuration screen rather than half-working against nothing.
 */

export interface AppConfig {
  apiBaseUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

const raw = {
  EXPO_PUBLIC_API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL,
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
};

export const missingConfig: string[] = Object.entries(raw)
  .filter(([, value]) => value === undefined || value === "")
  .map(([key]) => key);

export const config: AppConfig | null =
  missingConfig.length > 0
    ? null
    : {
        apiBaseUrl: (raw.EXPO_PUBLIC_API_BASE_URL as string).replace(/\/+$/, ""),
        supabaseUrl: raw.EXPO_PUBLIC_SUPABASE_URL as string,
        supabaseAnonKey: raw.EXPO_PUBLIC_SUPABASE_ANON_KEY as string,
      };
