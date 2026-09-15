import * as SecureStore from "expo-secure-store";

/**
 * Supabase session storage backed by the platform keystore (Android Keystore, iOS Keychain).
 *
 * The session holds refresh and access tokens, so it goes in encrypted storage rather than
 * AsyncStorage. SecureStore warns above ~2 KB per value on iOS and a Supabase session can be
 * larger, so values are split into chunks under `<key>.<n>`, with the chunk count at
 * `<key>.n`.
 */
const CHUNK = 1800;

// SecureStore keys allow only [A-Za-z0-9._-]. Supabase's keys fit, but normalise anyway.
const safe = (key: string): string => key.replace(/[^A-Za-z0-9._-]/g, "_");

async function removeChunks(key: string): Promise<void> {
  const count = Number((await SecureStore.getItemAsync(`${key}.n`)) ?? "0");
  for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(`${key}.${i}`);
  await SecureStore.deleteItemAsync(`${key}.n`);
}

export const secureStorage = {
  async getItem(name: string): Promise<string | null> {
    const key = safe(name);
    const count = await SecureStore.getItemAsync(`${key}.n`);
    if (count === null) return null;
    const parts: string[] = [];
    for (let i = 0; i < Number(count); i++) {
      const part = await SecureStore.getItemAsync(`${key}.${i}`);
      if (part === null) return null; // A torn write reads as signed out, never as garbage.
      parts.push(part);
    }
    return parts.join("");
  },

  async setItem(name: string, value: string): Promise<void> {
    const key = safe(name);
    await removeChunks(key);
    const chunks = value.match(new RegExp(`[\\s\\S]{1,${CHUNK}}`, "g")) ?? [""];
    for (let i = 0; i < chunks.length; i++) {
      await SecureStore.setItemAsync(`${key}.${i}`, chunks[i] as string);
    }
    await SecureStore.setItemAsync(`${key}.n`, String(chunks.length));
  },

  async removeItem(name: string): Promise<void> {
    await removeChunks(safe(name));
  },
};
