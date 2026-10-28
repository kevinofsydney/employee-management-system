import { DateTime } from "luxon";
import type { D1PreparedStatement } from "@cloudflare/workers-types";
import { hoursByKind, splitWork } from "../src/shared/time";
import { currentUser, HttpError, requireActive, requireAdmin } from "./auth";
import { audit, shiftViews } from "./data";
import { exportFile } from "./export";
import type { Env, Expense, Shift, Timesheet, User } from "./types";
import { bodyObject, expenses, range, string } from "./validation";

function reply(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

async function replaceExpenses(env: Env, timesheetId: string, rows: ReturnType<typeof expenses>, update?: D1PreparedStatement) {
  const statements: D1PreparedStatement[] = [];
  if (update) statements.push(update);
  statements.push(env.DB.prepare("DELETE FROM expenses WHERE timesheet_id = ?").bind(timesheetId));
  for (const row of rows) {
    statements.push(env.DB.prepare("INSERT INTO expenses(id, timesheet_id, incurred_on, description, amount_cents, receipt_sent) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), timesheetId, row.incurred_on, row.description, row.amount_cents, row.receipt_sent));
  }
  await env.DB.batch(statements);
}

function checkExpenseDates(rows: ReturnType<typeof expenses>, startAt: string, endAt: string) {
  const dates = new Set(splitWork(startAt, endAt).map((segment) => segment.date));
  for (const row of rows) if (!dates.has(row.incurred_on)) throw new HttpError(400, "Expense dates must fall on the worked shift.");
}

async function myTimesheet(request: Request, env: Env, user: User): Promise<Response> {
  requireActive(user);
  if (user.role !== "TRANSLATOR") throw new HttpError(403, "Translator access is required.");
  const body = await bodyObject(request);
  const shiftId = string(body.shiftId, "Shift ID", 80);
  const shift = await env.DB.prepare("SELECT * FROM shifts WHERE id = ? AND user_id = ?").bind(shiftId, user.id).first<Shift>();
  if (!shift) throw new HttpError(404, "Shift not found.");
  const { startAt, endAt } = range(body);
  if (Math.abs(DateTime.fromISO(startAt).diff(DateTime.fromISO(shift.start_at), "hours").hours) > 24) {
    throw new HttpError(400, "Actual times must be close to the rostered shift.");
  }
  const rows = expenses(body.expenses ?? []);
  checkExpenseDates(rows, startAt, endAt);
  const existing = await env.DB.prepare("SELECT * FROM timesheets WHERE shift_id = ?").bind(shiftId).first<Timesheet>();
  if (existing?.status === "APPROVED") throw new HttpError(409, "This timesheet is approved. Ask an admin to reopen it for a correction.");
  if (new Date(shift.start_at) > new Date()) throw new HttpError(409, "You can enter a timesheet once the shift has started.");
  const now = new Date().toISOString();
  const id = existing?.id ?? crypto.randomUUID();
  if (existing) {
    await replaceExpenses(env, id, rows, env.DB.prepare("UPDATE timesheets SET start_at = ?, end_at = ?, status = 'SUBMITTED', admin_note = '', submitted_at = ?, updated_at = ?, reviewed_at = NULL, reviewed_by = NULL WHERE id = ?")
      .bind(startAt, endAt, now, now, id));
  } else {
    await replaceExpenses(env, id, rows, env.DB.prepare("INSERT INTO timesheets(id, shift_id, user_id, start_at, end_at, status, admin_note, submitted_at, updated_at) VALUES (?, ?, ?, ?, ?, 'SUBMITTED', '', ?, ?)")
      .bind(id, shiftId, user.id, startAt, endAt, now, now));
  }
  await audit(env, user.id, existing ? "TIMESHEET_UPDATED" : "TIMESHEET_SUBMITTED", "Timesheet", id, { shiftId });
  return reply({ ok: true, id });
}

async function adminOverview(env: Env): Promise<Response> {
  const [users, shifts, settings] = await Promise.all([
    env.DB.prepare("SELECT * FROM users ORDER BY surname, legal_first_name, email").all<User>(),
    shiftViews(env),
    env.DB.prepare("SELECT key, value FROM settings").all<{ key: string; value: string }>()
  ]);
  const totals: Record<string, { standard: number; sunday: number; total: number }> = {};
  for (const shift of shifts) {
    if (shift.timesheet?.status !== "APPROVED") continue;
    const hours = hoursByKind(shift.timesheet.start_at, shift.timesheet.end_at);
    const current = totals[shift.user_id] ?? { standard: 0, sunday: 0, total: 0 };
    current.standard += hours.standard;
    current.sunday += hours.sunday;
    current.total += hours.standard + hours.sunday;
    totals[shift.user_id] = current;
  }
  return reply({ users: users.results, shifts, totals, settings: Object.fromEntries(settings.results.map((row) => [row.key, row.value])) });
}

async function adminUser(request: Request, env: Env, actor: User, id: string): Promise<Response> {
  const target = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<User>();
  if (!target || target.role !== "TRANSLATOR") throw new HttpError(404, "Translator not found.");
  const body = await bodyObject(request);
  const status = body.status === undefined ? target.status : string(body.status, "Status", 12);
  if (!["PENDING", "ACTIVE", "INACTIVE"].includes(status)) throw new HttpError(400, "Invalid status.");
  const first = body.legalFirstName === undefined ? target.legal_first_name : string(body.legalFirstName, "Legal first name", 20);
  const surname = body.surname === undefined ? target.surname : string(body.surname, "Surname", 30);
  const nickname = body.nickname === undefined ? target.nickname : string(body.nickname, "Nickname", 80, false);
  const card = body.myobCardId === undefined ? target.myob_card_id : string(body.myobCardId, "MYOB card ID", 15, false);
  if (status === "ACTIVE" && (!first || !surname)) throw new HttpError(400, "Enter the legal first name and surname before activation.");
  await env.DB.prepare("UPDATE users SET legal_first_name = ?, surname = ?, nickname = ?, myob_card_id = ?, status = ?, updated_at = ? WHERE id = ?")
    .bind(first, surname, nickname, card, status, new Date().toISOString(), id).run();
  await audit(env, actor.id, "USER_UPDATED", "User", id, { status });
  return reply({ ok: true });
}

async function adminShift(request: Request, env: Env, actor: User, id?: string): Promise<Response> {
  if (request.method === "DELETE") {
    if (!id) throw new HttpError(400, "Shift ID required.");
    const sheet = await env.DB.prepare("SELECT id FROM timesheets WHERE shift_id = ?").bind(id).first();
    if (sheet) throw new HttpError(409, "A submitted shift cannot be deleted. Edit the roster instead.");
    await env.DB.prepare("DELETE FROM shifts WHERE id = ?").bind(id).run();
    await audit(env, actor.id, "SHIFT_DELETED", "Shift", id);
    return reply({ ok: true });
  }
  const body = await bodyObject(request);
  const { startAt, endAt } = range(body);
  const note = string(body.note ?? "", "Note", 300, false);
  const now = new Date().toISOString();
  if (!id) {
    const userId = string(body.userId, "Translator", 80);
    const target = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(userId).first<User>();
    if (!target || target.role !== "TRANSLATOR" || target.status !== "ACTIVE") throw new HttpError(400, "Choose an active translator.");
    id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO shifts(id, user_id, start_at, end_at, note, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, userId, startAt, endAt, note, actor.id, now, now).run();
    await audit(env, actor.id, "SHIFT_CREATED", "Shift", id, { userId });
    return reply({ ok: true, id }, 201);
  }
  const existing = await env.DB.prepare("SELECT * FROM shifts WHERE id = ?").bind(id).first<Shift>();
  if (!existing) throw new HttpError(404, "Shift not found.");
  const approvedSheet = await env.DB.prepare("SELECT id FROM timesheets WHERE shift_id = ? AND status = 'APPROVED'").bind(id).first();
  if (approvedSheet) throw new HttpError(409, "This shift's timesheet is approved. Reopen the timesheet before changing the roster.");
  await env.DB.prepare("UPDATE shifts SET start_at = ?, end_at = ?, note = ?, updated_at = ? WHERE id = ?")
    .bind(startAt, endAt, note, now, id).run();
  await audit(env, actor.id, "SHIFT_UPDATED", "Shift", id);
  return reply({ ok: true });
}

async function adminTimesheet(request: Request, env: Env, actor: User, id: string): Promise<Response> {
  const sheet = await env.DB.prepare("SELECT * FROM timesheets WHERE id = ?").bind(id).first<Timesheet>();
  if (!sheet) throw new HttpError(404, "Timesheet not found.");
  const body = await bodyObject(request);
  const action = string(body.action, "Action", 20);
  const now = new Date().toISOString();
  if (action === "approve") {
    if (sheet.status === "APPROVED") throw new HttpError(409, "Already approved.");
    await env.DB.prepare("UPDATE timesheets SET status = 'APPROVED', admin_note = '', reviewed_at = ?, reviewed_by = ?, updated_at = ? WHERE id = ?")
      .bind(now, actor.id, now, id).run();
  } else if (action === "reject" || action === "reopen") {
    if (action === "reopen" && sheet.status !== "APPROVED") throw new HttpError(409, "Only approved timesheets can be reopened.");
    if (action === "reject" && sheet.status === "APPROVED") throw new HttpError(409, "Reopen this timesheet before sending it back.");
    const note = action === "reject" ? string(body.note, "Reason", 300) : string(body.note ?? "", "Reason", 300, false);
    await env.DB.prepare("UPDATE timesheets SET status = ?, admin_note = ?, reviewed_at = ?, reviewed_by = ?, updated_at = ? WHERE id = ?")
      .bind("REJECTED", note, now, actor.id, now, id).run();
  } else if (action === "edit") {
    if (sheet.status === "APPROVED") throw new HttpError(409, "Reopen this timesheet before editing it.");
    const { startAt, endAt } = range(body);
    const rows = expenses(body.expenses ?? []);
    checkExpenseDates(rows, startAt, endAt);
    await replaceExpenses(env, id, rows, env.DB.prepare("UPDATE timesheets SET start_at = ?, end_at = ?, status = 'SUBMITTED', reviewed_at = NULL, reviewed_by = NULL, updated_at = ? WHERE id = ?")
      .bind(startAt, endAt, now, id));
  } else {
    throw new HttpError(400, "Invalid action.");
  }
  await audit(env, actor.id, `TIMESHEET_${action.toUpperCase()}`, "Timesheet", id, { note: body.note ?? "" });
  return reply({ ok: true });
}

async function settings(request: Request, env: Env, actor: User): Promise<Response> {
  const body = await bodyObject(request);
  const standard = string(body.standard, "Standard payroll category", 31);
  const sunday = string(body.sunday, "Sunday payroll category", 31);
  await env.DB.batch([
    env.DB.prepare("UPDATE settings SET value = ? WHERE key = 'standard_payroll_category'").bind(standard),
    env.DB.prepare("UPDATE settings SET value = ? WHERE key = 'sunday_payroll_category'").bind(sunday)
  ]);
  await audit(env, actor.id, "SETTINGS_UPDATED", "Settings", "payroll_categories");
  return reply({ ok: true });
}

async function handle(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (!path.startsWith("/api/")) return new Response("Not found", { status: 404 });
  const user = await currentUser(request, env);
  if (path === "/api/me" && request.method === "GET") return reply({ user });
  if (path === "/api/me" && request.method === "PATCH") {
    const body = await bodyObject(request);
    const first = string(body.legalFirstName, "Legal first name", 20);
    const surname = string(body.surname, "Surname", 30);
    const nickname = string(body.nickname ?? "", "Nickname", 80, false);
    await env.DB.prepare("UPDATE users SET legal_first_name = ?, surname = ?, nickname = ?, updated_at = ? WHERE id = ?")
      .bind(first, surname, nickname, new Date().toISOString(), user.id).run();
    return reply({ ok: true });
  }
  if (path === "/api/my/shifts" && request.method === "GET") {
    requireActive(user);
    if (user.role !== "TRANSLATOR") throw new HttpError(403, "Translator access is required.");
    return reply({ shifts: await shiftViews(env, user.id) });
  }
  if (path === "/api/my/timesheets" && request.method === "POST") return myTimesheet(request, env, user);
  if (!path.startsWith("/api/admin/")) throw new HttpError(404, "Not found.");
  requireAdmin(user);
  if (path === "/api/admin/overview" && request.method === "GET") return adminOverview(env);
  if (path === "/api/admin/export" && request.method === "GET") return exportFile(request, env, user);
  if (path === "/api/admin/settings" && request.method === "PATCH") return settings(request, env, user);
  const userMatch = /^\/api\/admin\/users\/([^/]+)$/.exec(path);
  if (userMatch && request.method === "PATCH") return adminUser(request, env, user, userMatch[1]);
  if (path === "/api/admin/shifts" && request.method === "POST") return adminShift(request, env, user);
  const shiftMatch = /^\/api\/admin\/shifts\/([^/]+)$/.exec(path);
  if (shiftMatch && ["PATCH", "DELETE"].includes(request.method)) return adminShift(request, env, user, shiftMatch[1]);
  const sheetMatch = /^\/api\/admin\/timesheets\/([^/]+)$/.exec(path);
  if (sheetMatch && request.method === "PATCH") return adminTimesheet(request, env, user, sheetMatch[1]);
  throw new HttpError(404, "Not found.");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try { return await handle(request, env); }
    catch (error) {
      if (error instanceof HttpError) return reply({ error: error.message }, error.status);
      console.error(error);
      return reply({ error: "Something went wrong. Please try again." }, 500);
    }
  }
};
