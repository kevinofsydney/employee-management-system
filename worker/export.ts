import { DateTime } from "luxon";
import { splitWork, utcToLocal } from "../src/shared/time";
import { HttpError } from "./auth";
import { audit, shiftViews } from "./data";
import type { Env, User } from "./types";

function safeCell(value: string | number | boolean): string {
  const raw = String(value);
  const neutral = /^[\s]*[=+@\-]/.test(raw) && typeof value === "string" ? `'${raw}` : raw;
  return `"${neutral.replaceAll('"', '""')}"`;
}

function csv(rows: (string | number | boolean)[][]): string {
  return "\uFEFF" + rows.map((row) => row.map(safeCell).join(",")).join("\r\n") + "\r\n";
}

function inRange(date: string, from: string, to: string): boolean {
  return (!from || date >= from) && (!to || date <= to);
}

function name(user: User) { return [user.legal_first_name, user.surname].filter(Boolean).join(" "); }

export async function exportFile(request: Request, env: Env, actor: User): Promise<Response> {
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  if (!(["review", "myob", "expenses"] as (string | null)[]).includes(kind)) throw new HttpError(400, "Invalid export type.");
  if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) || (from && to && from > to)) {
    throw new HttpError(400, "Invalid date range.");
  }
  const shifts = (await shiftViews(env)).filter((shift) => shift.timesheet?.status === "APPROVED");
  let filename = "approved-hours.csv";
  let contentType = "text/csv; charset=utf-8";
  let output: string;

  if (kind === "review") {
    const rows: (string | number)[][] = [["Legal first name", "Nickname", "Surname", "Email", "MYOB card ID", "Date (Sydney)", "Rostered start (Sydney)", "Rostered end (Sydney)", "Actual start (Sydney)", "Actual end (Sydney)", "Hours worked", "Shift type", "Timesheet ID"]];
    for (const shift of shifts) {
      if (!shift.timesheet || !shift.user) continue;
      const segments = splitWork(shift.timesheet.start_at, shift.timesheet.end_at);
      for (const segment of segments) {
        if (!inRange(segment.date, from, to)) continue;
        const endDate = segment.end === "00:00" ? DateTime.fromISO(segment.date).plus({ days: 1 }).toISODate() : segment.date;
        rows.push([
          shift.user.legal_first_name, shift.user.nickname, shift.user.surname, shift.user.email, shift.user.myob_card_id,
          segment.date, utcToLocal(shift.start_at), utcToLocal(shift.end_at),
          `${segment.date}T${segment.start}`, `${endDate}T${segment.end}`,
          (segment.minutes / 60).toFixed(2), segment.kind === "SUNDAY" ? "Sunday" : "Standard", shift.timesheet.id
        ]);
      }
    }
    output = csv(rows);
  } else if (kind === "expenses") {
    filename = "approved-expenses.csv";
    const rows: (string | number)[][] = [["Legal first name", "Nickname", "Surname", "Email", "MYOB card ID", "Expense date (Sydney)", "Description", "Amount (AUD)", "Receipt sent to admin", "Timesheet ID"]];
    for (const shift of shifts) {
      if (!shift.timesheet || !shift.user) continue;
      for (const expense of shift.timesheet.expenses) {
        if (!inRange(expense.incurred_on, from, to)) continue;
        rows.push([shift.user.legal_first_name, shift.user.nickname, shift.user.surname, shift.user.email, shift.user.myob_card_id,
          expense.incurred_on, expense.description, (expense.amount_cents / 100).toFixed(2), expense.receipt_sent ? "Yes" : "No", shift.timesheet.id]);
      }
    }
    output = csv(rows);
  } else {
    filename = "myob-timesheets.txt";
    contentType = "text/plain; charset=utf-8";
    const settings = (await env.DB.prepare("SELECT key, value FROM settings").all<{ key: string; value: string }>()).results;
    const category = new Map(settings.map((row) => [row.key, row.value]));
    const standard = category.get("standard_payroll_category")?.trim();
    const sunday = category.get("sunday_payroll_category")?.trim();
    if (!standard || !sunday) throw new HttpError(400, "Set both MYOB payroll categories before exporting.");
    const rows: string[][] = [["{}"], ["Employee Co./Last Name", "Employee First Name", "Payroll Category", "Date", "Units", "Employee Card ID", "Start/Stop Time", "Notes"]];
    for (const shift of shifts) {
      if (!shift.timesheet || !shift.user) continue;
      for (const segment of splitWork(shift.timesheet.start_at, shift.timesheet.end_at)) {
        if (!inRange(segment.date, from, to)) continue;
        if (!shift.user.myob_card_id) throw new HttpError(400, `Add a MYOB card ID for ${name(shift.user)} before exporting.`);
        const date = DateTime.fromISO(segment.date).toFormat("dd/MM/yyyy");
        rows.push([shift.user.surname, shift.user.legal_first_name, segment.kind === "SUNDAY" ? sunday : standard,
          date, (segment.minutes / 60).toFixed(2), shift.user.myob_card_id,
          `Worked ${segment.start} to ${segment.end}`, `Shift ${shift.id}`]);
      }
    }
    output = rows.map((row) => row.map((cell) => cell.replaceAll("\t", " ").replaceAll(/[\r\n]/g, " ")).join("\t")).join("\r\n") + "\r\n";
  }
  await audit(env, actor.id, "CSV_EXPORTED", "Export", filename, { kind, from, to });
  return new Response(output, { headers: { "Content-Type": contentType, "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" } });
}
