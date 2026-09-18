import { Alert } from "react-native";

/** A blocking confirmation with one destructive choice. Native Alert here; window.confirm on web. */
export function confirmDestructive(title: string, body: string, action: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(title, body, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: action, style: "destructive", onPress: () => resolve(true) },
    ]);
  });
}

/** A message the person must see before continuing. */
export function notify(title: string, body: string): Promise<void> {
  return new Promise((resolve) => {
    Alert.alert(title, body, [{ text: "OK", onPress: () => resolve() }]);
  });
}
