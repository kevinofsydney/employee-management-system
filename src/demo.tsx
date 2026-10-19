import { DateTime } from "luxon";
import { useCallback } from "react";
import { AdminDashboard, TranslatorDashboard } from "./App";
import type { Overview, Shift, Timesheet, User } from "./types";

// The preview is loaded only by main.tsx on localhost in Vite development mode.
// These fictional records never touch the API or production database.
const zone = "Australia/Sydney";
const today = DateTime.now().setZone(zone).startOf("day");
const at = (days: number, hour: number, minute = 0) => today.plus({ days, hours: hour, minutes: minute }).toUTC().toISO()!;
const users: User[] = [
  { id: "demo-ava", email: "ava@example.invalid", legal_first_name: "Ava", nickname: "", surname: "Chen", role: "TRANSLATOR", status: "ACTIVE", myob_card_id: "AVA001" },
  { id: "demo-luca", email: "luca@example.invalid", legal_first_name: "Luca", nickname: "Lu", surname: "Moretti", role: "TRANSLATOR", status: "ACTIVE", myob_card_id: "LUC002" },
  { id: "demo-maya", email: "maya@example.invalid", legal_first_name: "Maya", nickname: "", surname: "Singh", role: "TRANSLATOR", status: "PENDING", myob_card_id: "" },
];
const sheet = (id: string, start: string, end: string, status: Timesheet["status"], expenses: Timesheet["expenses"] = []): Timesheet => ({ id: `sheet-${id}`, shift_id: id, start_at: start, end_at: end, status, admin_note: "", expenses });
const shifts: Shift[] = [
  { id: "demo-upcoming", user_id: users[0].id, user: users[0], start_at: at(1, 9), end_at: at(1, 17), note: "City walking tour", missing: false, timesheet: null },
  { id: "demo-submitted", user_id: users[0].id, user: users[0], start_at: at(-1, 9), end_at: at(-1, 17), note: "Harbour tour", missing: false, timesheet: sheet("demo-submitted", at(-1, 9), at(-1, 17, 15), "SUBMITTED", [{ id: "demo-expense", timesheet_id: "sheet-demo-submitted", incurred_on: today.minus({ days: 1 }).toISODate()!, description: "Taxi to venue", amount_cents: 2850, receipt_sent: 1 }]) },
  { id: "demo-missing", user_id: users[1].id, user: users[1], start_at: at(-3, 18), end_at: at(-2, 1), note: "Evening tour", missing: true, timesheet: null },
  { id: "demo-approved", user_id: users[1].id, user: users[1], start_at: at(-5, 10), end_at: at(-5, 16), note: "Private group", missing: false, timesheet: sheet("demo-approved", at(-5, 10), at(-5, 16), "APPROVED") },
];
const overview: Overview = {
  users, shifts,
  totals: { [users[0].id]: { standard: 8, sunday: 0, total: 8 }, [users[1].id]: { standard: 6, sunday: 0, total: 6 } },
  settings: { standard_payroll_category: "Base Hourly", sunday_payroll_category: "Sunday Hours" },
};

export default function Demo() {
  const admin = new URLSearchParams(location.search).get("demo") !== "translator";
  const call = useCallback(async <T,>(path: string, options?: RequestInit): Promise<T> => {
    if (options?.method && options.method !== "GET") throw new Error("This is a preview. Changes are not saved.");
    if (path === "/api/admin/overview") return overview as T;
    if (path === "/api/my/shifts") return { shifts: shifts.filter((shift) => shift.user_id === users[0].id) } as T;
    throw new Error("This action is unavailable in the preview.");
  }, []);
  return <div className="app-shell"><header className="topbar"><div className="brand"><span className="brand-mark">C</span><span>Courant <small>Roster</small></span></div><div className="top-actions"><span className="account-name">Fictional preview</span></div></header>
    <main className="content"><div className="notice info demo-notice"><strong>Local preview</strong><span>Fictional data. Changes and downloads are disabled until sign-in and hosting are configured.</span><div className="actions"><a href="/?demo=admin" className={admin ? "demo-link selected" : "demo-link"}>Admin view</a><a href="/?demo=translator" className={!admin ? "demo-link selected" : "demo-link"}>Translator view</a></div></div>
      {admin ? <AdminDashboard call={call} getToken={async () => null} /> : <TranslatorDashboard call={call} />}</main></div>;
}
