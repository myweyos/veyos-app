import * as SecureStore from "expo-secure-store";

/**
 * Small values kept on this device: the auth session, cycle settings, sync progress, declines.
 *
 * On a phone this is the platform keystore (Android Keystore, iOS Keychain). The web build
 * resolves `deviceStore.web.ts` instead. Nothing else in the app touches a storage API
 * directly, so the platform difference lives in exactly one place.
 */
export const deviceStore = {
  getItem: (key: string): Promise<string | null> => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string): Promise<void> => SecureStore.setItemAsync(key, value),
  deleteItem: (key: string): Promise<void> => SecureStore.deleteItemAsync(key),
};
