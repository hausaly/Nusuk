/** Nigeria (Africa/Lagos, UTC+1) and KSA (Asia/Riyadh, UTC+3) – neither observes DST, so fixed offsets are exact. */
export const TZ_NG = "Africa/Lagos";
export const TZ_KSA = "Asia/Riyadh";
const OFFSET_MIN: Record<string, number> = { [TZ_NG]: 60, [TZ_KSA]: 180 };

export const NG_AIRPORTS = ["LOS", "ABV", "KAN", "PHC", "ENU", "QOW", "ILR", "KAD", "YOL", "MIU", "SKO", "BNI", "CBQ"];
export const KSA_AIRPORTS = ["JED", "MED", "RUH", "DMM", "TIF", "YNB", "AHB", "ELQ", "TUU"];
export const airportTz = (code: string) => (NG_AIRPORTS.includes(code.toUpperCase()) ? TZ_NG : TZ_KSA);

/** "YYYY-MM-DDTHH:mm" (wall-clock in tz) → UTC Date. */
export function zonedToUtc(local: string, tz: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(local.trim());
  if (!m) throw new Error(`Bad date-time: ${local}`);
  const [, y, mo, d, h, mi] = m.map(Number) as unknown as number[];
  return new Date(Date.UTC(y, mo - 1, d, h, mi) - (OFFSET_MIN[tz] ?? 0) * 60_000);
}

export function fmtZoned(d: Date | null | undefined, tz: string, opts: Intl.DateTimeFormatOptions = {}): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, ...opts }).format(d);
}
/** Local calendar date key (YYYY-MM-DD) in tz. */
export function dateKey(d: Date, tz: string): string {
  return new Date(d.getTime() + (OFFSET_MIN[tz] ?? 0) * 60_000).toISOString().slice(0, 10);
}
export const hourIn = (d: Date, tz: string) => new Date(d.getTime() + (OFFSET_MIN[tz] ?? 0) * 60_000).getUTCHours();
/** Both zones, e.g. "02 Dec 2026, 06:45 KSA · 04:45 NG" – the app shows both where relevant. */
export function fmtBoth(d: Date | null | undefined, primary: "KSA" | "NG" = "KSA"): string {
  if (!d) return "—";
  const t = (tz: string) => fmtZoned(d, tz, { day: undefined, month: undefined, year: undefined });
  const day = fmtZoned(d, primary === "KSA" ? TZ_KSA : TZ_NG, { hour: undefined, minute: undefined });
  return primary === "KSA" ? `${day}, ${t(TZ_KSA)} KSA · ${t(TZ_NG)} NG` : `${day}, ${t(TZ_NG)} NG · ${t(TZ_KSA)} KSA`;
}
