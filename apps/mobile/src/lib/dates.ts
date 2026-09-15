/** Local-calendar date helpers. A "day" is the subject's own calendar day, not UTC's. */

const pad = (n: number): string => String(n).padStart(2, "0");

/** YYYY-MM-DD in the device's local time zone. */
export function localDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local midnight at the start of `iso` (YYYY-MM-DD), shifted by `days` and `hours`. */
export function atLocal(iso: string, days = 0, hours = 0): Date {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d + days, hours, 0, 0, 0);
}

/** The last `count` local days ending today, oldest first. */
export function recentDays(count: number, today: Date = new Date()): string[] {
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    out.push(localDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - i)));
  }
  return out;
}

/** Whole local days from `from` to `to` (both YYYY-MM-DD). */
export function daysBetween(from: string, to: string): number {
  return Math.round((atLocal(to).getTime() - atLocal(from).getTime()) / 86_400_000);
}

/** The device's IANA time zone, if the JS engine can tell us. */
export function deviceTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}
