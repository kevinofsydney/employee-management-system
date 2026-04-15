import { AuditAction } from "@prisma/client";
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

  const rates = await prisma.hourlyRate.findMany();
  const rateMap = new Map(rates.map((r) => [r.rateType, Number(r.amount)]));

  const entries = await prisma.timesheetEntry.findMany({
    where: {
      status: "APPROVED",
      ...(from || to
        ? {
            date: {
              ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
              ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {})
            }
          }
        : {})
    },
    include: {
      user: true,
      event: true
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }]
  });

  const rows = entries.map((entry) => {
    const rate = rateMap.get(entry.rateType) ?? 0;
    const hours = Number(entry.hours);
    return {
      translator_name: entry.user.fullName ?? "",
      email: entry.user.email,
      event_name: entry.event.name,
      date: entry.date.toISOString().slice(0, 10),
      start_time: entry.startTime,
      end_time: entry.endTime,
      total_hours: hours.toFixed(2),
      rate_type: entry.rateType,
      applicable_rate: rate.toFixed(2),
      total_amount: (hours * rate).toFixed(2)
    };
  });

  await logAudit({
    actorId: admin.id,
    action: AuditAction.CSV_EXPORTED,
    entityType: "TimesheetExport",
    entityId: new Date().toISOString(),
    details: { rowCount: rows.length, from, to }
  });

  const csv = stringify(rows, { header: true });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="myob-timesheet-export.csv"`
    }
  });
}
