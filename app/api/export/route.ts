import { stringify } from "csv-stringify/sync";
import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const admin = await requireAdmin();
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const approved = await prisma.timesheet.findMany({
    where: {
      status: "APPROVED",
      ...(from || to
        ? {
            periodStart: {
              ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
              ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {})
            }
          }
        : {})
    },
    include: {
      user: true,
      lineItems: {
        include: {
          project: true,
          languagePair: true
        }
      }
    },
    orderBy: [{ periodStart: "asc" }, { createdAt: "asc" }]
  });

  const rows = approved.flatMap((timesheet: (typeof approved)[number]) =>
    timesheet.lineItems.map((item: (typeof timesheet.lineItems)[number]) => ({
      translator_name: timesheet.user.fullName ?? "",
      email: timesheet.user.email,
      period_start: timesheet.periodStart.toISOString().slice(0, 10),
      period_end: timesheet.periodEnd.toISOString().slice(0, 10),
      project_client: item.project.name,
      language_pair: item.languagePair.label,
      hours: Number(item.hours).toFixed(2),
      notes: item.note ?? ""
    }))
  );

  await logAudit({
    actorId: admin.id,
    action: "CSV_EXPORTED",
    entityType: "TimesheetExport",
    entityId: new Date().toISOString(),
    details: { rowCount: rows.length, from, to }
  });

  const csv = stringify(rows, {
    header: true
  });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="approved-timesheets.csv"`
    }
  });
}
