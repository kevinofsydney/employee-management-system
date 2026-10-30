import { DateTime } from "luxon";
import { validateRange, ZONE } from "./time.ts";
import type { Sheet } from "./xlsx.ts";

// Reads tour roster workbooks: any table with Name and Email headers plus one or more date columns
// ("SEP 22 SHOW", "22/9", or a real date cell). Each filled date cell ("11:00 - 2330") becomes a shift.
// Sheets without such a table, such as pay summaries or email-less copies, are ignored.

export type RosterRow = {
  sheet: string;
  city: string;
  role: string;
  name: string;
  email: string;
  dateLabel: string;
  timeLabel: string;
  /** Sydney wall-clock times for the API, empty when `problem` is set. */
  startLocal: string;
  endLocal: string;
  /** UTC instants, for matching shifts already on the roster. */
  startAt: string;
  endAt: string;
  problem: string;
  /** True when only the date or time is unreadable, so entering times by hand makes the row importable. */
  fixable: boolean;
};

export type RosterScan = { rows: RosterRow[]; sheetsUsed: string[]; sheetsSkipped: string[] };

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_WORD = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b\.?/i;
const EMAIL = /^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/;
const clean = (value: string | undefined) => (value ?? "").replace(/\s+/g, " ").trim();

export function titleCase(value: string): string {
  return value.toLowerCase().replace(/(^|[\s(\-/])([a-z])/g, (_, before: string, letter: string) => before + letter.toUpperCase());
}

/** Splits a roster name for the users table: last word is the surname, parentheses are dropped. */
export function splitName(name: string): { first: string; surname: string } {
  const words = clean(name.replace(/[()]/g, " ")).split(" ").filter(Boolean);
  if (words.length < 2) return { first: (words[0] ?? "").slice(0, 20), surname: "" };
  return { first: words.slice(0, -1).join(" ").slice(0, 20).trim(), surname: words[words.length - 1].slice(0, 30) };
}

/** A default event name from the file name: "MAMAMOO INTERPRETER SHEET.xlsx" becomes "MAMAMOO". */
export function eventFromFileName(fileName: string): string {
  const base = clean(fileName.replace(/\.[^.]+$/, "").replace(/[_]+/g, " "));
  const trimmed = clean(base.replace(/\b(interpreters?|translators?|rosters?|sheets?|staff|crew|final|copy|v\d+)\b/gi, " ").replace(/[-–·]+\s*$/, ""));
  return (trimmed || base).slice(0, 80);
}

export function rosterNote(event: string, row: Pick<RosterRow, "city" | "role">): string {
  return [clean(event), row.city, row.role].filter(Boolean).join(" · ").slice(0, 300);
}

type DateParts = { month: number; day: number; year?: number };

export function parseDateLabel(label: string): DateParts | null {
  const text = clean(label);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
  const word = MONTH_WORD.exec(text);
  if (word) {
    const rest = text.replace(word[0], " ");
    const day = /(?:^|[^\d])(\d{1,2})(?:st|nd|rd|th)?(?![\d])/i.exec(rest);
    if (!day) return null;
    const year = /\b(\d{4})\b/.exec(rest);
    return { month: MONTHS.indexOf(word[1].slice(0, 3).toLowerCase()) + 1, day: Number(day[1]), ...(year ? { year: Number(year[1]) } : {}) };
  }
  // Australian day/month order.
  const numeric = /(?:^|[^\d])(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2}|\d{4}))?(?![\d])/.exec(text);
  if (numeric) {
    const year = numeric[3] ? Number(numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3]) : undefined;
    return { day: Number(numeric[1]), month: Number(numeric[2]), ...(year ? { year } : {}) };
  }
  return null;
}

/** Picks the year that puts a month and day closest to today, so a roster in late December can list early January. */
function resolveDate(parts: DateParts, today: DateTime, year?: number): DateTime | null {
  const candidates = parts.year ? [parts.year] : year ? [year] : [today.year - 1, today.year, today.year + 1];
  const dates = candidates.map((y) => DateTime.fromObject({ year: y, month: parts.month, day: parts.day }, { zone: ZONE })).filter((d) => d.isValid);
  if (!dates.length) return null;
  return dates.reduce((best, d) => (Math.abs(d.diff(today).toMillis()) < Math.abs(best.diff(today).toMillis()) ? d : best));
}

function parseClock(text: string): number | null {
  const m = /^(\d{1,2})(?::?(\d{2}))?\s*(am|pm|a|p)?$/i.exec(clean(text).replace(".", ":"));
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2] ?? 0);
  const half = m[3]?.toLowerCase()[0];
  if (half && (hour < 1 || hour > 12)) return null;
  if (half === "p" && hour < 12) hour += 12;
  if (half === "a" && hour === 12) hour = 0;
  if (hour > 24 || minute > 59 || (hour === 24 && minute > 0)) return null;
  return hour * 60 + minute;
}

export function parseTimeRange(text: string): { start: number; end: number } | null {
  const parts = clean(text).split(/\s*(?:-|–|—|\bto\b|\buntil\b)\s*/i).filter(Boolean);
  if (parts.length !== 2) return null;
  const start = parseClock(parts[0]);
  let end = parseClock(parts[1]);
  if (start === null || end === null || start >= 24 * 60) return null;
  // "9-5" means 9am to 5pm: a 12-hour end time with no am/pm that falls before the start is read
  // as pm when that lands later the same day. "22:00 - 2:00" still crosses midnight.
  if (end <= start && end < 12 * 60 && end + 12 * 60 > start && !/[ap]m?$/i.test(parts[1])) end += 12 * 60;
  return { start, end: end <= start ? end + 24 * 60 : end };
}

function localTime(date: DateTime, minutes: number): string {
  return date.startOf("day").plus({ minutes }).toFormat("yyyy-MM-dd'T'HH:mm");
}

type Header = { row: number; name: number; email: number; role: number; status: number; dates: { column: number; label: string; parts: DateParts }[] };

function findHeader(row: string[], index: number): Header | null {
  const cells = row.map((cell) => clean(cell).toLowerCase());
  const name = cells.findIndex((cell) => /^(full )?name$/.test(cell));
  const email = cells.findIndex((cell) => /^e-?mail( address)?$/.test(cell));
  if (name < 0 || email < 0) return null;
  const role = cells.findIndex((cell) => /^(role|position|job)$/.test(cell));
  const status = cells.findIndex((cell) => /^status$/.test(cell));
  const taken = new Set([name, email, role, status]);
  const dates = row.flatMap((cell, column) => {
    if (taken.has(column)) return [];
    const parts = parseDateLabel(cell ?? "");
    return parts ? [{ column, label: clean(cell), parts }] : [];
  });
  return { row: index, name, email, role, status, dates };
}

/** The nearest single-cell row above a table, such as a merged "MELBOURNE" banner. */
function tableTitle(rows: string[][], headerRow: number): string {
  for (let index = headerRow - 1; index >= Math.max(0, headerRow - 3); index--) {
    const filled = (rows[index] ?? []).map(clean).filter(Boolean);
    if (filled.length === 1) return filled[0];
  }
  return "";
}

/** One filled roster cell before any checks, from the spreadsheet reader or the AI reader. */
export type RosterEntry = Pick<RosterRow, "sheet" | "city" | "role" | "name" | "email" | "dateLabel" | "timeLabel"> & { status: string };

type ScanOptions = { today?: DateTime; year?: number };

/** Resolves dates and times and flags anything that can't be imported as is. */
export function checkEntries(entries: RosterEntry[], options: ScanOptions = {}): RosterRow[] {
  const today = (options.today ?? DateTime.now()).setZone(ZONE).startOf("day");
  const seen = new Set<string>();
  return entries.map(({ status, ...source }) => {
    const name = clean(source.name);
    const email = clean(source.email).toLowerCase();
    const entry: RosterRow = { ...source, name, email, startLocal: "", endLocal: "", startAt: "", endAt: "", problem: "", fixable: false };
    const parts = parseDateLabel(source.dateLabel);
    const date = parts && resolveDate(parts, today, options.year);
    const times = parseTimeRange(source.timeLabel);
    if (status && !/confirm/i.test(status)) entry.problem = `Status is “${clean(status)}”`;
    else if (!name) entry.problem = "No name";
    else if (!EMAIL.test(email)) entry.problem = email ? "Email address looks wrong" : "No email address";
    else {
      entry.fixable = true;
      if (!date) entry.problem = `Couldn't read the date “${source.dateLabel}”`;
      else if (!times) entry.problem = `Couldn't read the time “${source.timeLabel}”`;
      else if (times.start % 15 || times.end % 15) entry.problem = "Times must be in 15-minute steps";
      else {
        entry.startLocal = localTime(date, times.start);
        entry.endLocal = localTime(date, times.end);
        try {
          const range = validateRange(entry.startLocal, entry.endLocal);
          entry.startAt = range.startAt;
          entry.endAt = range.endAt;
          entry.fixable = false;
          const key = `${email}|${range.startAt}|${range.endAt}`;
          if (seen.has(key)) entry.problem = "Listed twice in this file";
          seen.add(key);
        } catch (error) {
          entry.problem = (error as Error).message;
        }
      }
    }
    return entry;
  });
}

export function scanRoster(sheets: Sheet[], options: ScanOptions = {}): RosterScan {
  const entries: RosterEntry[] = [];
  const sheetsUsed: string[] = [];
  const sheetsSkipped: string[] = [];
  for (const sheet of sheets) {
    let used = false;
    for (let index = 0; index < sheet.rows.length; index++) {
      const header = findHeader(sheet.rows[index] ?? [], index);
      if (!header || !header.dates.length) continue;
      used = true;
      const city = titleCase(tableTitle(sheet.rows, index) || sheet.name);
      for (index = index + 1; index < sheet.rows.length; index++) {
        const row = sheet.rows[index] ?? [];
        const name = clean(row[header.name]);
        const email = clean(row[header.email]).toLowerCase();
        if (!name && !email) break;
        const role = header.role >= 0 ? titleCase(clean(row[header.role])) : "";
        const status = header.status >= 0 ? clean(row[header.status]) : "";
        for (const column of header.dates) {
          const timeLabel = clean(row[column.column]);
          if (timeLabel) entries.push({ sheet: sheet.name, city, role, name, email, status, dateLabel: column.label, timeLabel });
        }
      }
    }
    (used ? sheetsUsed : sheetsSkipped).push(sheet.name);
  }
  return { rows: checkEntries(entries, options), sheetsUsed, sheetsSkipped };
}

/** Plain-text copy of a workbook for the AI reader: one tab-separated block per sheet. */
export function workbookText(sheets: Sheet[], maxLength = 60_000): string {
  const text = sheets.map((sheet) => `### Sheet: ${sheet.name}\n${sheet.rows.map((row) => row.map(clean).join("\t").replace(/\t+$/, "")).filter(Boolean).join("\n")}`).join("\n\n");
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}
