import { deviceStore } from "./deviceStore";

/**
 * Supabase session storage on top of deviceStore (keystore on a phone, localStorage on web).
 *
 * The session holds refresh and access tokens, so on a phone it goes in encrypted storage
 * rather than AsyncStorage. SecureStore warns above ~2 KB per value on iOS and a Supabase
 * session can be larger, so values are split into chunks under `<key>.<n>`, with the chunk
 * count at `<key>.n`. The chunking is harmless on web.
 */
const CHUNK = 1800;

// SecureStore keys allow only [A-Za-z0-9._-]. Supabase's keys fit, but normalise anyway.
const safe = (key: string): string => key.replace(/[^A-Za-z0-9._-]/g, "_");

async function removeChunks(key: string): Promise<void> {
  const count = Number((await deviceStore.getItem(`${key}.n`)) ?? "0");
  for (let i = 0; i < count; i++) await deviceStore.deleteItem(`${key}.${i}`);
  await deviceStore.deleteItem(`${key}.n`);
}

export const secureStorage = {
  async getItem(name: string): Promise<string | null> {
    const key = safe(name);
    const count = await deviceStore.getItem(`${key}.n`);
    if (count === null) return null;
    const parts: string[] = [];
    for (let i = 0; i < Number(count); i++) {
      const part = await deviceStore.getItem(`${key}.${i}`);
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
      await deviceStore.setItem(`${key}.${i}`, chunks[i] as string);
    }
    await deviceStore.setItem(`${key}.n`, String(chunks.length));
  },

  async removeItem(name: string): Promise<void> {
    await removeChunks(safe(name));
  },
};
