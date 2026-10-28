import { DateTime } from "luxon";

export const ZONE = "Australia/Sydney";

export type WorkSegment = { date: string; start: string; end: string; minutes: number; kind: "STANDARD" | "SUNDAY" };

export function localToUtc(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:(00|15|30|45)$/.test(value)) {
    throw new Error("Use a date and time in 15-minute steps.");
  }
  const date = DateTime.fromISO(value, { zone: ZONE });
  if (!date.isValid || date.toFormat("yyyy-MM-dd'T'HH:mm") !== value) {
    throw new Error("That Sydney date or time does not exist.");
  }
  return date.toUTC().toISO({ suppressMilliseconds: true })!;
}

export function utcToLocal(value: string): string {
  return DateTime.fromISO(value, { zone: "utc" }).setZone(ZONE).toFormat("yyyy-MM-dd'T'HH:mm");
}

export function validateRange(startLocal: string, endLocal: string): { startAt: string; endAt: string } {
  const startAt = localToUtc(startLocal);
  const endAt = localToUtc(endLocal);
  const minutes = DateTime.fromISO(endAt).diff(DateTime.fromISO(startAt), "minutes").minutes;
  if (minutes <= 0 || minutes > 24 * 60 || minutes % 15 !== 0) {
    throw new Error("A shift must last between 15 minutes and 24 hours.");
  }
  return { startAt, endAt };
}

export function splitWork(startAt: string, endAt: string): WorkSegment[] {
  let cursor: DateTime = DateTime.fromISO(startAt, { zone: "utc" }).setZone(ZONE);
  const finish: DateTime = DateTime.fromISO(endAt, { zone: "utc" }).setZone(ZONE);
  if (!cursor.isValid || !finish.isValid || finish <= cursor) throw new Error("Invalid time range.");
  const segments: WorkSegment[] = [];
  while (cursor < finish) {
    const nextMidnight: DateTime = cursor.plus({ days: 1 }).startOf("day");
    const end: DateTime = nextMidnight < finish ? nextMidnight : finish;
    const date = cursor.toISODate()!;
    segments.push({
      date,
      start: cursor.toFormat("HH:mm"),
      end: end.toFormat("HH:mm"),
      minutes: Math.round(end.diff(cursor, "minutes").minutes),
      kind: cursor.weekday === 7 ? "SUNDAY" : "STANDARD"
    });
    cursor = end;
  }
  return segments;
}

export function hoursByKind(startAt: string, endAt: string) {
  const segments = splitWork(startAt, endAt);
  return {
    standard: segments.filter((s) => s.kind === "STANDARD").reduce((n, s) => n + s.minutes, 0) / 60,
    sunday: segments.filter((s) => s.kind === "SUNDAY").reduce((n, s) => n + s.minutes, 0) / 60
  };
}

export function isMissing(endAt: string, now: DateTime = DateTime.now()): boolean {
  const cutoff = DateTime.fromISO(endAt, { zone: "utc" }).setZone(ZONE).plus({ days: 1 }).startOf("day").plus({ hours: 9 });
  return now.setZone(ZONE) >= cutoff;
}

// The Monday–Sunday week containing a shift, in Sydney dates. Expense receipts may be dated
// anywhere in that week: translators often pay for a taxi or parking before the shift starts.
export function shiftWeek(startAt: string): { start: string; end: string } {
  const start = DateTime.fromISO(startAt, { zone: "utc" }).setZone(ZONE).startOf("day");
  const monday = start.minus({ days: start.weekday - 1 });
  return { start: monday.toISODate()!, end: monday.plus({ days: 6 }).toISODate()! };
}
