/**
 * Light/dark palette selection.
 *
 * app.json sets userInterfaceStyle: "automatic", so the app follows the OS. Every component
 * must render in both — the design brief requires light + dark + Dynamic Type XXL without
 * the verdict block or the takeover truncating.
 */

import { useColorScheme } from "react-native";

import { color, colorDark } from "./tokens";

export type Palette = typeof color;

export function useTheme(): Palette {
  const scheme = useColorScheme();
  return scheme === "dark" ? (colorDark as unknown as Palette) : color;
}
