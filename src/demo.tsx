import { DateTime } from "luxon";
import { useCallback, useState } from "react";
import { AdminDashboard, TranslatorDashboard } from "./App";
import { buildExport, exportFileInfo, isExportKind } from "./shared/export";
import { ZONE, isMissing, localToUtc, validateRange } from "./shared/time";
import type { Overview, Shift, Timesheet, User } from "./types";

// Local preview: a complete, interactive copy of the app backed by memory instead of the API.
// Loaded by main.tsx on localhost only. Nothing here touches the network or a real database.

const today = DateTime.now().setZone(ZONE).startOf("day");
const at = (days: number, hour: number, minute = 0) => today.plus({ days, hours: hour, minutes: minute }).toUTC().toISO({ suppressMilliseconds: true })!;
const day = (days: number) => today.plus({ days }).toISODate()!;
const id = (prefix: string) => `demo-${prefix}`;

const admin: User = { id: id("admin"), email: "david@example.invalid", legal_first_name: "David", surname: "Okafor", nickname: "", role: "ADMIN", status: "ACTIVE", myob_card_id: "" };

function translator(id: string, first: string, surname: string, options: Partial<User> = {}): User {
  return { id, email: `${first.toLowerCase()}@example.invalid`, legal_first_name: first, surname, nickname: "", role: "TRANSLATOR", status: "ACTIVE", myob_card_id: "", ...options };
}

const ava = translator(id("ava"), "Ava", "Chen", { nickname: "Ava", myob_card_id: "AVA001" });
const luca = translator(id("luca"), "Luca", "Moretti", { myob_card_id: "LUC002" });
const priya = translator(id("priya"), "Priya", "Nair", { myob_card_id: "PRI003" });
const sarah = translator(id("sarah"), "Sarah", "O'Leary", { status: "INACTIVE", myob_card_id: "SAR004" });
const tom = translator(id("tom"), "Tom", "Nguyen", { status: "PENDING" });

type ShiftDraft = Omit<Shift, "missing"> & { missing?: boolean };

let users: User[] = [admin, ava, luca, priya, sarah, tom];
let settings: Record<string, string> = { standard_payroll_category: "Base Hourly", sunday_payroll_category: "Sunday Hours" };
let shifts: ShiftDraft[] = [];
let counter = 0;

function expense(shift: ShiftDraft, incurredOn: string, description: string, cents: number, receipt: boolean) {
  counter += 1;
  return { id: id(`exp-${counter}`), timesheet_id: shift.timesheet?.id ?? "", incurred_on: incurredOn, description, amount_cents: cents, receipt_sent: receipt ? 1 : 0 };
}

function shift(user: User, startDay: number, startHour: number, endDay: number, endHour: number, endMinute: number, options: {
  note?: string; status?: Timesheet["status"] | null; adminNote?: string; actualMinutes?: number; withExpenses?: boolean;
} = {}): ShiftDraft {
  const startAt = at(startDay, startHour);
  const endAt = at(endDay, endHour, endMinute);
  const key = id(`shift-${++counter}`);
  const sheetId = id(`sheet-${counter}`);
  const draft: ShiftDraft = { id: key, user_id: user.id, user, start_at: startAt, end_at: endAt, note: options.note ?? "", missing: false, timesheet: null };
  if (options.status) {
    const actualEnd = options.actualMinutes ? DateTime.fromISO(startAt).plus({ minutes: options.actualMinutes }).toISO({ suppressMilliseconds: true })! : endAt;
    draft.timesheet = { id: sheetId, shift_id: key, start_at: startAt, end_at: actualEnd, status: options.status, admin_note: options.adminNote ?? "", expenses: [] };
    if (options.withExpenses) {
      draft.timesheet.expenses = [
        expense(draft, day(startDay), "Taxi to venue", 2850, true),
        expense(draft, day(startDay), "Coffee and water for the group", 1240, false)
      ];
    }
  }
  return draft;
}

function seed() {
  users = [admin, ava, luca, priya, sarah, tom];
  settings = { standard_payroll_category: "Base Hourly", sunday_payroll_category: "Sunday Hours" };
  counter = 0;
  shifts = [
    // Upcoming roster
    shift(ava, 1, 9, 1, 17, 0, { note: "City walking tour" }),
    shift(luca, 2, 18, 2, 23, 30, { note: "Evening food tour" }),
    shift(priya, 4, 10, 4, 16, 0, { note: "Private group — museum" }),
    shift(ava, 6, 22, 7, 2, 0, { note: "Night tour, crosses midnight" }),

    // Awaiting review
    shift(ava, -1, 9, -1, 17, 0, { note: "Harbour tour", status: "SUBMITTED", actualMinutes: 495, withExpenses: true }),
    shift(priya, -2, 18, -2, 23, 0, { note: "Evening tour", status: "SUBMITTED", actualMinutes: 285 }),

    // Approved, including an overnight Sunday split
    shift(ava, -21, 22, -20, 2, 15, { note: "Night tour", status: "APPROVED", withExpenses: true }),
    shift(luca, -16, 9, -16, 17, 0, { note: "City walking tour", status: "APPROVED" }),
    shift(priya, -14, 10, -14, 16, 0, { note: "Sunday private group", status: "APPROVED", withExpenses: true }),
    shift(ava, -9, 9, -9, 17, 15, { note: "Harbour tour", status: "APPROVED", actualMinutes: 480 }),
    shift(sarah, -33, 9, -33, 15, 0, { note: "Archive shift", status: "APPROVED" }),

    // Sent back for correction
    shift(luca, -6, 18, -6, 23, 0, { note: "Evening food tour", status: "REJECTED", adminNote: "Actual finish looks like the rostered time. Please correct." }),

    // Never submitted
    shift(luca, -4, 18, -4, 23, 0, { note: "Evening tour" }),
    shift(priya, -8, 9, -8, 17, 0, { note: "City walking tour" })
  ];
}

seed();

function view(): Shift[] {
  return shifts.map((draft) => ({
    ...draft,
    missing: !draft.timesheet && isMissing(draft.end_at),
    timesheet: draft.timesheet
      ? { ...draft.timesheet, expenses: draft.timesheet.expenses.map((item) => ({ ...item, timesheet_id: draft.timesheet!.id })) }
      : null
  }));
}

function totals() {
  const out: Overview["totals"] = {};
  for (const item of view()) {
    if (item.timesheet?.status !== "APPROVED") continue;
    const start = DateTime.fromISO(item.timesheet.start_at, { zone: "utc" }).setZone(ZONE);
    const end = DateTime.fromISO(item.timesheet.end_at, { zone: "utc" }).setZone(ZONE);
    let cursor = start;
    while (cursor < end) {
      const midnight = cursor.plus({ days: 1 }).startOf("day");
      const stop = midnight < end ? midnight : end;
      const hours = stop.diff(cursor, "minutes").minutes / 60;
      const current = out[item.user_id] ?? { standard: 0, sunday: 0, total: 0 };
      if (cursor.weekday === 7) current.sunday += hours; else current.standard += hours;
      current.total += hours;
      out[item.user_id] = current;
      cursor = stop;
    }
  }
  return out;
}

function overview(): Overview {
  return { users, shifts: view(), totals: totals(), settings };
}

function findShift(shiftId: string): ShiftDraft {
  const found = shifts.find((item) => item.id === shiftId);
  if (!found) throw new Error("Shift not found.");
  return found;
}

function replaceShift(next: ShiftDraft) {
  shifts = shifts.map((item) => (item.id === next.id ? next : item));
}

function applyTimesheet(shiftId: string, body: { startLocal: string; endLocal: string; expenses?: unknown[] }) {
  const target = findShift(shiftId);
  const { startAt, endAt } = validateRange(String(body.startLocal), String(body.endLocal));
  const now = new Date().toISOString();
  const rows = Array.isArray(body.expenses) ? body.expenses.slice(0, 20) : [];
  const expenses = rows.map((raw, index) => {
    const row = raw as { incurredOn?: string; description?: string; amountCents?: number; receiptSent?: boolean };
    const incurred = String(row.incurredOn ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(incurred)) throw new Error("Invalid expense date.");
    if (!row.description || !String(row.description).trim()) throw new Error("Expense description is required.");
    const cents = Number(row.amountCents);
    if (!Number.isInteger(cents) || cents <= 0) throw new Error("Enter a valid expense amount.");
    counter += 1;
    return { id: id(`exp-${counter}-${index}`), timesheet_id: target.timesheet?.id ?? id(`sheet-${counter}`), incurred_on: incurred, description: String(row.description).trim(), amount_cents: cents, receipt_sent: row.receiptSent ? 1 : 0 };
  });
  if (target.timesheet?.status === "APPROVED") throw new Error("This timesheet is approved. Ask an admin to reopen it for a correction.");
  if (target.timesheet) {
    target.timesheet = { ...target.timesheet, start_at: startAt, end_at: endAt, status: "SUBMITTED", admin_note: "", expenses };
  } else {
    target.timesheet = { id: id(`sheet-${++counter}`), shift_id: target.id, start_at: startAt, end_at: endAt, status: "SUBMITTED", admin_note: "", expenses };
  }
  target.missing = false;
  replaceShift(target);
  return now;
}

function decide(sheetId: string, action: string, note: string) {
  const target = shifts.find((item) => item.timesheet?.id === sheetId);
  if (!target?.timesheet) throw new Error("Timesheet not found.");
  if (action === "approve") {
    if (target.timesheet.status === "APPROVED") throw new Error("Already approved.");
    target.timesheet = { ...target.timesheet, status: "APPROVED", admin_note: "" };
  } else if (action === "reject") {
    if (!note.trim()) throw new Error("Add a reason before sending it back.");
    target.timesheet = { ...target.timesheet, status: "REJECTED", admin_note: note.trim() };
  } else if (action === "reopen") {
    if (target.timesheet.status !== "APPROVED") throw new Error("Only approved timesheets can be reopened.");
    target.timesheet = { ...target.timesheet, status: "SUBMITTED", admin_note: note.trim() };
  } else {
    throw new Error("Invalid action.");
  }
  replaceShift(target);
}

function makeDownload(getToken: () => Promise<string | null>) {
  return async (url: string, filename: string) => {
    const parsed = new URL(url, "https://preview.local");
    const kind = parsed.searchParams.get("kind");
    if (!isExportKind(kind)) throw new Error("Invalid export type.");
    const from = parsed.searchParams.get("from") ?? "";
    const to = parsed.searchParams.get("to") ?? "";
    const approved = view().filter((item) => item.timesheet?.status === "APPROVED" && item.user);
    const body = buildExport(kind, approved.map((item) => ({
      id: item.id, start_at: item.start_at, end_at: item.end_at, user: item.user!,
      timesheet: item.timesheet ? { id: item.timesheet.id, start_at: item.timesheet.start_at, end_at: item.timesheet.end_at, expenses: item.timesheet.expenses } : null
    })), { standard: settings.standard_payroll_category ?? "", sunday: settings.sunday_payroll_category ?? "" }, from, to);
    const info = exportFileInfo(kind);
    const blob = new Blob([body], { type: info.contentType });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename || info.filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  };
}

export default function Demo() {
  const [role, setRole] = useState(() => new URLSearchParams(location.search).get("demo") === "translator" ? "translator" : "admin");
  const [notice, setNotice] = useState("");
  const downloadFile = makeDownload(async () => null);

  const call = useCallback(async <T,>(path: string, options: RequestInit = {}): Promise<T> => {
    const method = options.method ?? "GET";
    const body = options.body ? JSON.parse(String(options.body)) as Record<string, unknown> : {};
    const done = (message: string) => { setNotice(message); };
    try {
      if (method === "GET" && path === "/api/admin/overview") return overview() as T;
      if (method === "GET" && path === "/api/my/shifts") {
        const me = role === "admin" ? ava : luca;
        return { shifts: view().filter((item) => item.user_id === me.id) } as T;
      }
      if (method === "PATCH" && path === "/api/me") {
        const me = role === "admin" ? ava : luca;
        users = users.map((item) => item.id === me.id ? { ...item, legal_first_name: String(body.legalFirstName ?? item.legal_first_name), surname: String(body.surname ?? item.surname), nickname: String(body.nickname ?? item.nickname) } : item);
        done("Name saved in this preview.");
        return { ok: true } as T;
      }
      if (method === "POST" && path === "/api/my/timesheets") { applyTimesheet(String(body.shiftId), body as never); done("Timesheet submitted in this preview."); return { ok: true } as T; }
      const sheet = /^\/api\/admin\/timesheets\/([^/]+)$/.exec(path);
      if (method === "PATCH" && sheet) {
        const action = String(body.action ?? "");
        if (action === "edit") { applyTimesheet(findShift(shifts.find((item) => item.timesheet?.id === sheet[1])?.id ?? "").id, body as never); done("Correction saved in this preview."); }
        else { decide(sheet[1], action, String(body.note ?? "")); done(`Timesheet ${action === "reject" ? "sent back" : action === "approve" ? "approved" : "reopened"} in this preview.`); }
        return { ok: true } as T;
      }
      if (method === "PATCH" && path === "/api/admin/settings") {
        settings = { standard_payroll_category: String(body.standard ?? ""), sunday_payroll_category: String(body.sunday ?? "") };
        done("MYOB categories saved in this preview.");
        return { ok: true } as T;
      }
      const person = /^\/api\/admin\/users\/([^/]+)$/.exec(path);
      if (method === "PATCH" && person) {
        users = users.map((item) => item.id === person[1] ? {
          ...item,
          legal_first_name: String(body.legalFirstName ?? item.legal_first_name),
          surname: String(body.surname ?? item.surname),
          nickname: String(body.nickname ?? item.nickname),
          myob_card_id: String(body.myobCardId ?? item.myob_card_id),
          status: (body.status ?? item.status) as User["status"]
        } : item);
        done("Translator updated in this preview.");
        return { ok: true } as T;
      }
      if (method === "POST" && path === "/api/admin/shifts") {
        const owner = users.find((item) => item.id === String(body.userId));
        if (!owner) throw new Error("Choose an active translator.");
        const { startAt, endAt } = validateRange(String(body.startLocal), String(body.endLocal));
        shifts = [...shifts, { id: id(`shift-${++counter}`), user_id: owner.id, user: owner, start_at: startAt, end_at: endAt, note: String(body.note ?? ""), missing: false, timesheet: null }];
        done("Shift added in this preview.");
        return { ok: true } as T;
      }
      const shiftPath = /^\/api\/admin\/shifts\/([^/]+)$/.exec(path);
      if (shiftPath && method === "PATCH") {
        const target = findShift(shiftPath[1]);
        if (target.timesheet?.status === "APPROVED") throw new Error("This shift's timesheet is approved. Reopen the timesheet before changing the roster.");
        const { startAt, endAt } = validateRange(String(body.startLocal), String(body.endLocal));
        replaceShift({ ...target, start_at: startAt, end_at: endAt, note: String(body.note ?? "") });
        done("Shift updated in this preview.");
        return { ok: true } as T;
      }
      if (shiftPath && method === "DELETE") {
        const target = findShift(shiftPath[1]);
        if (target.timesheet) throw new Error("A submitted shift cannot be deleted. Edit the roster instead.");
        shifts = shifts.filter((item) => item.id !== target.id);
        done("Shift deleted in this preview.");
        return { ok: true } as T;
      }
      throw new Error("This action is unavailable in the preview.");
    } catch (error) {
      setNotice("");
      throw error;
    }
  }, [role]);

  const switchRole = (next: string) => { setRole(next); setNotice(""); window.history.replaceState(null, "", `/?demo=${next}`); };
  const banner = role === "admin" ? "Admin preview · fictional data · every action is simulated in memory" : "Translator preview · fictional data · every action is simulated in memory";

  return <div className="app-shell"><header className="topbar"><div className="brand"><span className="brand-mark">C</span><span>Courant <small>Roster</small></span></div><div className="top-actions"><span className="account-name">{role === "admin" ? "David Okafor (admin)" : "Luca Moretti"}</span></div></header>
    <main className="content"><div className="notice info demo-notice"><strong>Demo mode</strong><span>{banner}. Downloads are real files built from this data.</span><div className="actions"><button className={role === "admin" ? "demo-link selected" : "demo-link"} onClick={() => switchRole("admin")}>Admin view</button><button className={role === "translator" ? "demo-link selected" : "demo-link"} onClick={() => switchRole("translator")}>Translator view</button></div></div>
      {notice && <div className="notice success" role="status">{notice}</div>}
      {role === "admin" ? <AdminDashboard call={call} getToken={async () => null} downloadFile={downloadFile} /> : <TranslatorDashboard call={call} />}</main></div>;
}
