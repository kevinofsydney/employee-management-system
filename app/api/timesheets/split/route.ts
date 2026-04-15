import { AuditAction } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { calculateHours } from "@/lib/time";
import { splitEntrySchema } from "@/lib/validators";

export async function POST(request: Request) {
  const admin = await requireAdmin();
  const formData = await request.formData();
  const payload = splitEntrySchema.parse({
    entryId: formData.get("entryId"),
    splitTime: formData.get("splitTime"),
    firstRateType: formData.get("firstRateType"),
    secondRateType: formData.get("secondRateType")
  });

  const entry = await prisma.timesheetEntry.findUnique({ where: { id: payload.entryId } });
  if (!entry) {
    return NextResponse.json({ error: "Entry not found." }, { status: 404 });
  }

  const firstHours = calculateHours(entry.startTime, payload.splitTime);
  const secondHours = calculateHours(payload.splitTime, entry.endTime);

  if (firstHours <= 0 || secondHours <= 0) {
    return NextResponse.json({ error: "Split time must be between start and end time." }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.timesheetEntry.update({
      where: { id: entry.id },
      data: {
        endTime: payload.splitTime,
        hours: firstHours,
        rateType: payload.firstRateType
      }
    }),
    prisma.timesheetEntry.create({
      data: {
        userId: entry.userId,
        eventId: entry.eventId,
        date: entry.date,
        startTime: payload.splitTime,
        endTime: entry.endTime,
        hours: secondHours,
        rateType: payload.secondRateType,
        comment: entry.comment,
        status: entry.status,
        submittedAt: entry.submittedAt,
        reviewedAt: entry.reviewedAt,
        adminComment: entry.adminComment
      }
    })
  ]);

  await logAudit({
    actorId: admin.id,
    targetUserId: entry.userId,
    action: AuditAction.ENTRY_SPLIT,
    entityType: "TimesheetEntry",
    entityId: entry.id,
    details: {
      splitTime: payload.splitTime,
      firstRateType: payload.firstRateType,
      secondRateType: payload.secondRateType,
      firstHours,
      secondHours
    }
  });

  return NextResponse.redirect(new URL("/admin", request.url));
}
