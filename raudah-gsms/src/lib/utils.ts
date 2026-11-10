import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Lower-cases/trims an e-mail; returns null for empty input. */
export function normalizeEmail(v?: string | null): string | null {
  const s = v?.trim().toLowerCase();
  return s ? s : null;
}

/**
 * Normalises a phone number: strips spaces/dashes/brackets. Nigerian local numbers
 * (0803…, 11 digits) become +234803…; "234…" gets a "+" prefix.
 */
export function normalizePhone(v?: string | null): string | null {
  if (!v) return null;
  let s = v.replace(/[\s\-().]/g, "");
  if (!s) return null;
  if (/^0\d{10}$/.test(s)) s = "+234" + s.slice(1);
  else if (/^234\d{10}$/.test(s)) s = "+" + s;
  else if (/^00\d+$/.test(s)) s = "+" + s.slice(2);
  return s;
}

/** Login identifier → email or phone lookup keys. */
export function parseIdentifier(raw: string): { email?: string; phone?: string } {
  const s = raw.trim();
  if (s.includes("@")) return { email: s.toLowerCase() };
  return { phone: normalizePhone(s) ?? undefined };
}
