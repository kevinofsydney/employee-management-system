import type { RosterEntry } from "../src/shared/roster";
import { HttpError } from "./auth";
import { audit } from "./data";
import type { Env, User } from "./types";
import { bodyObject, string } from "./validation";

// Beta fallback for roster layouts the built-in reader doesn't recognise. The browser sends a plain-text
// copy of the workbook only when an admin asks for it; DeepSeek returns rows, and the browser runs them
// through the same checks and editable preview as the built-in reader. Nothing is saved here.

const MAX_TEXT = 60_000;
const MAX_ENTRIES = 1000;

const INSTRUCTIONS = `You extract work shifts from a tour roster spreadsheet, given as tab-separated text, one block per sheet.
Return JSON: {"entries": [{"sheet", "city", "role", "name", "email", "status", "date", "start", "end"}]}, one entry per person per date they work.
- date: "YYYY-MM-DD" when the sheet states the year, otherwise the month and day as "Sep 22".
- start and end: 24-hour "HH:MM" exactly as rostered. An end before the start means the shift finishes after midnight; keep it as written.
- city: the city or venue heading of the table, if any. role: the person's role or position, if any. status: the status column, if any.
- Copy names and email addresses exactly. Use "" for anything missing. Do not invent people, dates or times.
- Ignore pay, rates, totals, hour summaries, reimbursements and any sheet that lists no shift times.`;

function field(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : typeof value === "number" ? String(value) : "";
}

export async function readRosterWithAi(request: Request, env: Env, actor: User): Promise<Response> {
  if (!env.DEEPSEEK_API_KEY) throw new HttpError(503, "AI reading isn't set up for this site.");
  const body = await bodyObject(request);
  const text = string(body.text, "Workbook text", MAX_TEXT);
  const fileName = string(body.fileName ?? "", "File name", 200, false);
  let response: Response;
  try {
    response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: env.DEEPSEEK_MODEL || "deepseek-chat",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: INSTRUCTIONS }, { role: "user", content: `File: ${fileName}\n\n${text}` }]
      }),
      signal: AbortSignal.timeout(90_000)
    });
  } catch {
    throw new HttpError(504, "The AI reader didn't respond in time. Try again, or enter the shifts by hand.");
  }
  if (!response.ok) {
    const status = response.status === 402 || response.status === 429 ? "has reached its spending or rate limit" : `returned an error (${response.status})`;
    throw new HttpError(502, `The AI reader ${status}. Try again later, or enter the shifts by hand.`);
  }
  let entries: unknown;
  try {
    const result = await response.json() as { choices?: { message?: { content?: string } }[] };
    entries = (JSON.parse(result.choices?.[0]?.message?.content ?? "") as { entries?: unknown }).entries;
  } catch {
    throw new HttpError(502, "The AI reader's answer couldn't be read. Try again, or enter the shifts by hand.");
  }
  if (!Array.isArray(entries)) throw new HttpError(502, "The AI reader didn't find any shifts in this file.");
  const rows: RosterEntry[] = entries.slice(0, MAX_ENTRIES).filter((item) => item && typeof item === "object").map((item) => {
    const row = item as Record<string, unknown>;
    const start = field(row.start, 10);
    const end = field(row.end, 10);
    return {
      sheet: field(row.sheet, 80), city: field(row.city, 80), role: field(row.role, 80), name: field(row.name, 80), email: field(row.email, 254),
      status: field(row.status, 40), dateLabel: field(row.date, 40), timeLabel: start || end ? `${start} - ${end}` : ""
    };
  });
  await audit(env, actor.id, "ROSTER_READ_WITH_AI", "Roster", crypto.randomUUID(), { fileName, characters: text.length, entries: rows.length });
  return Response.json({ entries: rows }, { headers: { "Cache-Control": "no-store" } });
}
