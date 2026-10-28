import { ExportError, buildExport, exportFileInfo, isExportKind, validateDateRange } from "../src/shared/export";
import { HttpError } from "./auth";
import { audit, shiftViews } from "./data";
import type { ExportShift, PayrollCategories } from "../src/shared/export";
import type { Env, User } from "./types";

export async function exportFile(request: Request, env: Env, actor: User): Promise<Response> {
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  if (!isExportKind(kind)) throw new HttpError(400, "Invalid export type.");

  const approved = (await shiftViews(env)).filter((shift) => shift.timesheet?.status === "APPROVED" && shift.user);
  const shifts: ExportShift[] = approved.map((shift) => ({
    id: shift.id,
    start_at: shift.start_at,
    end_at: shift.end_at,
    user: shift.user!,
    timesheet: shift.timesheet
      ? { id: shift.timesheet.id, start_at: shift.timesheet.start_at, end_at: shift.timesheet.end_at, expenses: shift.timesheet.expenses }
      : null
  }));

  const settings = (await env.DB.prepare("SELECT key, value FROM settings").all<{ key: string; value: string }>()).results;
  const stored = new Map(settings.map((row) => [row.key, row.value]));
  const categories: PayrollCategories = {
    standard: stored.get("standard_payroll_category") ?? "",
    sunday: stored.get("sunday_payroll_category") ?? ""
  };

  let output: string;
  try {
    validateDateRange(from, to);
    output = buildExport(kind, shifts, categories, from, to);
  } catch (error) {
    if (error instanceof ExportError) throw new HttpError(400, error.message);
    throw error;
  }

  const { filename, contentType } = exportFileInfo(kind);
  await audit(env, actor.id, "CSV_EXPORTED", "Export", filename, { kind, from, to });
  return new Response(output, { headers: { "Content-Type": contentType, "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" } });
}
