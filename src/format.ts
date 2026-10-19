import { DateTime } from "luxon";
import { hoursByKind, utcToLocal, ZONE } from "./shared/time";
import type { User } from "./types";

export function displayName(user: User): string {
  return user.nickname || [user.legal_first_name, user.surname].filter(Boolean).join(" ") || user.email;
}

export function fullName(user: User): string {
  return [user.legal_first_name, user.surname].filter(Boolean).join(" ") || user.email;
}

export function dateTime(utc: string): string {
  return DateTime.fromISO(utc, { zone: "utc" }).setZone(ZONE).toFormat("ccc d LLL, h:mm a");
}

export function shiftTime(start: string, end: string): string {
  const a = DateTime.fromISO(start, { zone: "utc" }).setZone(ZONE);
  const b = DateTime.fromISO(end, { zone: "utc" }).setZone(ZONE);
  return a.hasSame(b, "day") ? `${a.toFormat("ccc d LLL, h:mm a")}–${b.toFormat("h:mm a")}` : `${a.toFormat("ccc d LLL, h:mm a")}–${b.toFormat("ccc d LLL, h:mm a")}`;
}

export function localInput(utc: string): string { return utcToLocal(utc); }
export function money(cents: number): string { return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(cents / 100); }
export function hours(start: string, end: string) {
  const kinds = hoursByKind(start, end);
  return `${(kinds.standard + kinds.sunday).toFixed(2)} h${kinds.sunday ? ` · ${kinds.sunday.toFixed(2)} Sunday` : ""}`;
}
