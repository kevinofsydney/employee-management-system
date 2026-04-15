import { AuditAction } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { roundStartTime, roundEndTime, calculateHours } from "@/lib/time";
import { editEntrySchema } from "@/lib/validators";

export async function POST(request: Request) {
  const admin = await requireAdmin();
  const formData = await request.formData();
  const payload = editEntrySchema.parse({
    entryId: formData.get("entryId"),
    eventId: formData.get("eventId") || undefined,
    date: formData.get("date") || undefined,
    startTime: formData.get("startTime") || undefined,
    endTime: formData.get("endTime") || undefined,
    rateType: formData.get("rateType") || undefined,
    comment: formData.get("comment") || undefined
  });

  const entry = await prisma.timesheetEntry.findUnique({ where: { id: payload.entryId } });
  if (!entry) {
    return NextResponse.json({ error: "Entry not found." }, { status: 404 });
  }

  const startTime = payload.startTime ? roundStartTime(payload.startTime) : entry.startTime;
  const endTime = payload.endTime ? roundEndTime(payload.endTime) : entry.endTime;
  const hours = calculateHours(startTime, endTime);

  await prisma.timesheetEntry.update({
    where: { id: payload.entryId },
    data: {
      ...(payload.eventId && { eventId: payload.eventId }),
      ...(payload.date && { date: new Date(payload.date) }),
      startTime,
      endTime,
      hours,
      ...(payload.rateType && { rateType: payload.rateType }),
      ...(payload.comment !== undefined && { comment: payload.comment })
    }
  });

  await logAudit({
    actorId: admin.id,
    targetUserId: entry.userId,
    action: AuditAction.TIMESHEET_REOPENED,
    entityType: "TimesheetEntry",
    entityId: entry.id,
    details: { adminEdited: true, changes: payload }
  });

  return NextResponse.redirect(new URL("/admin", request.url));
}
