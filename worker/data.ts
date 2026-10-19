import type { Env, Expense, Shift, ShiftView, Timesheet, User } from "./types";
import { isMissing } from "../src/shared/time";

export async function shiftViews(env: Env, userId?: string): Promise<ShiftView[]> {
  const shifts = (await env.DB.prepare(`SELECT * FROM shifts ${userId ? "WHERE user_id = ?" : ""} ORDER BY start_at DESC`)
    .bind(...(userId ? [userId] : [])).all<Shift>()).results;
  const sheets = (await env.DB.prepare(`SELECT * FROM timesheets ${userId ? "WHERE user_id = ?" : ""}`)
    .bind(...(userId ? [userId] : [])).all<Timesheet>()).results;
  const allExpenses = (await env.DB.prepare("SELECT * FROM expenses").all<Expense>()).results;
  const users = userId ? [] : (await env.DB.prepare("SELECT * FROM users").all<User>()).results;
  const sheetsByShift = new Map(sheets.map((sheet) => [sheet.shift_id, sheet]));
  const expensesBySheet = new Map<string, Expense[]>();
  for (const expense of allExpenses) {
    const current = expensesBySheet.get(expense.timesheet_id) ?? [];
    current.push(expense);
    expensesBySheet.set(expense.timesheet_id, current);
  }
  const usersById = new Map(users.map((user) => [user.id, user]));
  return shifts.map((shift) => {
    const sheet = sheetsByShift.get(shift.id);
    return {
      ...shift,
      timesheet: sheet ? { ...sheet, expenses: expensesBySheet.get(sheet.id) ?? [] } : null,
      ...(userId ? {} : { user: usersById.get(shift.user_id) }),
      missing: !sheet && isMissing(shift.end_at)
    };
  });
}

export async function audit(env: Env, actorId: string, action: string, entityType: string, entityId: string, details: object = {}) {
  await env.DB.prepare("INSERT INTO audit_logs(id, actor_id, action, entity_type, entity_id, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), actorId, action, entityType, entityId, JSON.stringify(details), new Date().toISOString()).run();
}
