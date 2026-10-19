import { HttpError } from "./auth";
import { validateRange } from "../src/shared/time";
import type { Expense } from "./types";

export async function bodyObject(request: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "Invalid request body.");
  }
}

export function string(value: unknown, label: string, max = 160, required = true): string {
  if (typeof value !== "string") throw new HttpError(400, `${label} is required.`);
  const clean = value.trim();
  if (clean.length > max || (required && !clean)) throw new HttpError(400, `${label} must be ${required ? `1–${max}` : `at most ${max}`} characters.`);
  return clean;
}

export function range(body: Record<string, unknown>): { startAt: string; endAt: string } {
  try {
    return validateRange(string(body.startLocal, "Start time", 16), string(body.endLocal, "End time", 16));
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : "Invalid times.");
  }
}

export function expenses(value: unknown): Omit<Expense, "id" | "timesheet_id">[] {
  if (!Array.isArray(value) || value.length > 20) throw new HttpError(400, "Enter up to 20 expenses.");
  return value.map((item) => {
    if (!item || typeof item !== "object") throw new HttpError(400, "Invalid expense.");
    const row = item as Record<string, unknown>;
    const incurred_on = string(row.incurredOn, "Expense date", 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(incurred_on)) throw new HttpError(400, "Invalid expense date.");
    const description = string(row.description, "Expense description", 160);
    const amount_cents = Number(row.amountCents);
    if (!Number.isInteger(amount_cents) || amount_cents <= 0 || amount_cents > 10_000_000) throw new HttpError(400, "Enter a valid expense amount.");
    return { incurred_on, description, amount_cents, receipt_sent: row.receiptSent === true ? 1 : 0 };
  });
}
