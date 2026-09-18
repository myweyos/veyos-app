/**
 * Web variant of deviceStore: the browser's localStorage.
 *
 * There is no keystore in a browser. localStorage is where Supabase keeps a web session by
 * default too; the values are scoped to the site origin and never sent anywhere by the browser.
 * A private window or blocked storage reads as empty, which the app treats as signed out.
 */
function store(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export const deviceStore = {
  getItem: async (key: string): Promise<string | null> => store()?.getItem(key) ?? null,
  setItem: async (key: string, value: string): Promise<void> => {
    store()?.setItem(key, value);
  },
  deleteItem: async (key: string): Promise<void> => {
    store()?.removeItem(key);
  },
};
