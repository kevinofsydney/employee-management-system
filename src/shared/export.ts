import { DateTime } from "luxon";
import { splitWork, utcToLocal } from "./time.ts";

// Export building is deliberately pure: no database, no request objects. The worker loads rows,
// and the local preview builds the same files from fictional data, so both produce identical output.

export class ExportError extends Error {}

export type ExportKind = "review" | "myob" | "expenses";

export type ExportExpense = {
  incurred_on: string;
  description: string;
  amount_cents: number;
  receipt_sent: number;
};

export type ExportShift = {
  id: string;
  start_at: string;
  end_at: string;
  user: {
    legal_first_name: string;
    nickname: string;
    surname: string;
    email: string;
    myob_card_id: string;
  };
  timesheet: {
    id: string;
    start_at: string;
    end_at: string;
    expenses: ExportExpense[];
  } | null;
};

export type PayrollCategories = { standard: string; sunday: string };

const KINDS: ExportKind[] = ["review", "myob", "expenses"];

export function isExportKind(kind: string | null): kind is ExportKind {
  return !!kind && (KINDS as string[]).includes(kind);
}

export function validateDateRange(from: string, to: string): void {
  const realDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = DateTime.fromISO(value, { zone: "utc" });
    return parsed.isValid && parsed.toISODate() === value;
  };
  if ((from && !realDate(from)) || (to && !realDate(to)) || (from && to && from > to)) {
    throw new ExportError("Invalid date range.");
  }
}

export function exportFileInfo(kind: ExportKind): { filename: string; contentType: string } {
  if (kind === "myob") return { filename: "myob-timesheets.txt", contentType: "text/plain; charset=utf-8" };
  if (kind === "expenses") return { filename: "approved-expenses.csv", contentType: "text/csv; charset=utf-8" };
  return { filename: "approved-hours.csv", contentType: "text/csv; charset=utf-8" };
}

// Spreadsheet formula injection guard: a leading =, +, @ or - is neutralised with an apostrophe.
function safeCell(value: string | number): string {
  const raw = String(value);
  const neutral = typeof value === "string" && /^\s*[=+@-]/.test(raw) ? `'${raw}` : raw;
  return `"${neutral.replaceAll('"', '""')}"`;
}

function csv(rows: (string | number)[][]): string {
  return "\uFEFF" + rows.map((row) => row.map(safeCell).join(",")).join("\r\n") + "\r\n";
}

function inRange(date: string, from: string, to: string): boolean {
  return (!from || date >= from) && (!to || date <= to);
}

function name(user: ExportShift["user"]): string {
  return [user.legal_first_name, user.surname].filter(Boolean).join(" ");
}

function cells(row: string[]): string {
  return row.map((cell) => cell.replaceAll("\t", " ").replaceAll(/[\r\n]/g, " ")).join("\t");
}

function approved(shifts: ExportShift[]): ExportShift[] {
  return shifts.filter((shift) => shift.timesheet);
}

export function buildExport(kind: ExportKind, shifts: ExportShift[], categories: PayrollCategories, from = "", to = ""): string {
  validateDateRange(from, to);
  const usable = approved(shifts);

  if (kind === "review") {
    const rows: (string | number)[][] = [["Legal first name", "Nickname", "Surname", "Email", "MYOB card ID", "Date (Sydney)", "Rostered start (Sydney)", "Rostered end (Sydney)", "Actual start (Sydney)", "Actual end (Sydney)", "Hours worked", "Shift type", "Timesheet ID"]];
    for (const shift of usable) {
      const sheet = shift.timesheet!;
      for (const segment of splitWork(sheet.start_at, sheet.end_at)) {
        if (!inRange(segment.date, from, to)) continue;
        const endDate = segment.end === "00:00" ? DateTime.fromISO(segment.date).plus({ days: 1 }).toISODate()! : segment.date;
        rows.push([
          shift.user.legal_first_name, shift.user.nickname, shift.user.surname, shift.user.email, shift.user.myob_card_id,
          segment.date, utcToLocal(shift.start_at), utcToLocal(shift.end_at),
          `${segment.date}T${segment.start}`, `${endDate}T${segment.end}`,
          (segment.minutes / 60).toFixed(2), segment.kind === "SUNDAY" ? "Sunday" : "Standard", sheet.id
        ]);
      }
    }
    return csv(rows);
  }

  if (kind === "expenses") {
    const rows: (string | number)[][] = [["Legal first name", "Nickname", "Surname", "Email", "MYOB card ID", "Expense date (Sydney)", "Description", "Amount (AUD)", "Receipt sent to admin", "Timesheet ID"]];
    for (const shift of usable) {
      const sheet = shift.timesheet!;
      for (const expense of sheet.expenses) {
        if (!inRange(expense.incurred_on, from, to)) continue;
        rows.push([shift.user.legal_first_name, shift.user.nickname, shift.user.surname, shift.user.email, shift.user.myob_card_id,
          expense.incurred_on, expense.description, (expense.amount_cents / 100).toFixed(2), expense.receipt_sent ? "Yes" : "No", sheet.id]);
      }
    }
    return csv(rows);
  }

  const standard = categories.standard.trim();
  const sunday = categories.sunday.trim();
  if (!standard || !sunday) throw new ExportError("Set both MYOB payroll categories before exporting.");
  const rows: string[][] = [["{}"], ["Employee Co./Last Name", "Employee First Name", "Payroll Category", "Date", "Units", "Employee Card ID", "Start/Stop Time", "Notes"]];
  for (const shift of usable) {
    const sheet = shift.timesheet!;
    for (const segment of splitWork(sheet.start_at, sheet.end_at)) {
      if (!inRange(segment.date, from, to)) continue;
      if (!shift.user.myob_card_id) throw new ExportError(`Add a MYOB card ID for ${name(shift.user)} before exporting.`);
      rows.push([shift.user.surname, shift.user.legal_first_name, segment.kind === "SUNDAY" ? sunday : standard,
        DateTime.fromISO(segment.date).toFormat("dd/MM/yyyy"), (segment.minutes / 60).toFixed(2), shift.user.myob_card_id,
        `Worked ${segment.start} to ${segment.end}`, `Shift ${shift.id}`]);
    }
  }
  return rows.map(cells).join("\r\n") + "\r\n";
}
