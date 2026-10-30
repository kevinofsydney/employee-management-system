import type { D1PreparedStatement } from "@cloudflare/workers-types";
import { splitName } from "../src/shared/roster";
import { HttpError } from "./auth";
import { audit } from "./data";
import type { Env, User } from "./types";
import { bodyObject, range, string } from "./validation";

// Bulk roster import. The browser parses the workbook and sends only the shifts David confirmed;
// this re-validates every row and applies the whole import in one D1 batch.

const EMAIL = /^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/;
const MAX_ROWS = 1000;

export type ImportSkip = { email: string; reason: string };

export async function importRoster(request: Request, env: Env, actor: User): Promise<Response> {
  const body = await bodyObject(request);
  if (!Array.isArray(body.shifts) || body.shifts.length === 0 || body.shifts.length > MAX_ROWS) {
    throw new HttpError(400, `Send between 1 and ${MAX_ROWS} shifts.`);
  }
  const rows = body.shifts.map((item, index) => {
    if (!item || typeof item !== "object") throw new HttpError(400, `Row ${index + 1} is invalid.`);
    const row = item as Record<string, unknown>;
    // Each row names an existing person by userId (the admin's choice in the preview) or gives an email,
    // which matches someone already here or adds a new person.
    const userId = row.userId === undefined ? "" : string(row.userId, `Row ${index + 1} person`, 80);
    const email = userId ? "" : string(row.email, `Row ${index + 1} email`, 254).toLowerCase();
    if (!userId && !EMAIL.test(email)) throw new HttpError(400, `Row ${index + 1} has an invalid email address.`);
    try {
      return { userId, email, name: string(row.name, "Name", 80), note: string(row.note ?? "", "Note", 300, false), ...range(row) };
    } catch (error) {
      throw new HttpError(400, `Row ${index + 1} (${email || "chosen person"}): ${(error as Error).message}`);
    }
  });

  const admins = new Set((env.ADMIN_EMAILS ?? "").split(",").map((part) => part.trim().toLowerCase()).filter(Boolean));
  const everyone = (await env.DB.prepare("SELECT * FROM users").all<User>()).results;
  const users = new Map(everyone.map((user) => [user.email.toLowerCase(), user]));
  const usersById = new Map(everyone.map((user) => [user.id, user]));
  for (const [index, row] of rows.entries()) {
    if (!row.userId) continue;
    const chosen = usersById.get(row.userId);
    if (!chosen) throw new HttpError(400, `Row ${index + 1}: the chosen person no longer exists. Reload and try again.`);
    row.email = chosen.email.toLowerCase();
  }
  const existing = new Set((await env.DB.prepare("SELECT user_id, start_at, end_at FROM shifts").all<{ user_id: string; start_at: string; end_at: string }>()).results
    .map((shift) => `${shift.user_id}|${shift.start_at}|${shift.end_at}`));

  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  const skipped: ImportSkip[] = [];
  const added = new Set<string>();
  const activated = new Set<string>();
  let created = 0;
  let duplicates = 0;
  for (const row of rows) {
    let user = users.get(row.email);
    if (admins.has(row.email) || user?.role === "ADMIN") { skipped.push({ email: row.email, reason: "is an admin account" }); continue; }
    if (user?.status === "INACTIVE") { skipped.push({ email: row.email, reason: "is deactivated. Reactivate them under People first" }); continue; }
    if (!user) {
      // Not signed up yet: add them now, already active. Signing up with this email claims the row.
      const { first, surname } = splitName(row.name);
      user = { id: crypto.randomUUID(), clerk_id: null, email: row.email, legal_first_name: first, surname, nickname: "", role: "TRANSLATOR", status: "ACTIVE", myob_card_id: "", created_at: now, updated_at: now };
      statements.push(env.DB.prepare("INSERT INTO users (id, clerk_id, email, legal_first_name, surname, nickname, role, status, myob_card_id, created_at, updated_at) VALUES (?, NULL, ?, ?, ?, '', 'TRANSLATOR', 'ACTIVE', '', ?, ?)")
        .bind(user.id, user.email, first, surname, now, now));
      users.set(row.email, user);
      added.add(user.id);
    } else if (user.status === "PENDING") {
      // Rostering someone vets them, so a pending sign-up is activated, keeping any name they entered.
      const { first, surname } = splitName(row.name);
      statements.push(env.DB.prepare("UPDATE users SET status = 'ACTIVE', legal_first_name = CASE WHEN legal_first_name = '' THEN ? ELSE legal_first_name END, surname = CASE WHEN surname = '' THEN ? ELSE surname END, updated_at = ? WHERE id = ?")
        .bind(first, surname, now, user.id));
      user = { ...user, status: "ACTIVE" };
      users.set(row.email, user);
      activated.add(user.id);
    }
    const key = `${user.id}|${row.startAt}|${row.endAt}`;
    if (existing.has(key)) { duplicates += 1; continue; }
    existing.add(key);
    statements.push(env.DB.prepare("INSERT INTO shifts(id, user_id, start_at, end_at, note, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), user.id, row.startAt, row.endAt, row.note, actor.id, now, now));
    created += 1;
  }

  if (statements.length) await env.DB.batch(statements);
  const result = { created, duplicates, peopleAdded: added.size, peopleActivated: activated.size, skipped };
  await audit(env, actor.id, "ROSTER_IMPORTED", "Roster", crypto.randomUUID(), { ...result, skipped: skipped.length });
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
