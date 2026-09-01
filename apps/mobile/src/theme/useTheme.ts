/**
 * Palette access.
 *
 * The design pack (docs/design/Weyos_MVP_All_Screens_v0.5.html) defines one light palette on
 * a cream ground. It specifies no dark variant, so this returns the single palette rather
 * than inventing one — a guessed dark theme would be exactly the kind of invention the pack
 * is here to stop.
 *
 * app.json still sets userInterfaceStyle "automatic". Dark mode is an open question for
 * design, not something to fill in here.
 */

import { color } from "./tokens";

export type Palette = typeof color;

export function useTheme(): Palette {
  return color;
}
