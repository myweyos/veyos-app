/** Web variant of dialog: React Native's Alert does nothing in a browser, so use the browser's own. */
export async function confirmDestructive(title: string, body: string, _action: string): Promise<boolean> {
  return window.confirm(`${title}\n\n${body}`);
}

export async function notify(title: string, body: string): Promise<void> {
  window.alert(`${title}\n\n${body}`);
}
