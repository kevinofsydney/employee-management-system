import { NextResponse } from "next/server";

import { requireAppUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { submitTimesheetSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const user = await requireAppUser();

  if (user.status !== "ACTIVE") {
    return NextResponse.json({ error: "Only active translators can submit timesheets." }, { status: 403 });
  }

  const formData = await request.formData();
  const payload = submitTimesheetSchema.parse({
    periodStart: formData.get("periodStart"),
    periodEnd: formData.get("periodEnd"),
    mode: formData.get("mode"),
    items: JSON.parse(formData.get("lineItemsJson")?.toString() ?? "[]")
  });
  const periodStart = new Date(payload.periodStart);
  const periodEnd = new Date(payload.periodEnd);

  const existingApproved = await prisma.timesheet.findFirst({
    where: {
      userId: user.id,
      periodStart,
      periodEnd,
      status: "APPROVED",
      reopenedAt: null
    }
  });

  if (existingApproved) {
    return NextResponse.json({ error: "An approved timesheet already exists for this pay period." }, { status: 409 });
  }

  const editableExisting = await prisma.timesheet.findFirst({
    where: {
      userId: user.id,
      periodStart,
      periodEnd,
      status: { in: ["DRAFT", "REJECTED"] }
    },
    orderBy: {
      updatedAt: "desc"
    }
  });

  const timesheet = editableExisting
    ? await prisma.timesheet.update({
        where: { id: editableExisting.id },
        data: {
          status: payload.mode === "submit" ? "SUBMITTED" : "DRAFT",
          submittedAt: payload.mode === "submit" ? new Date() : null,
          reviewedAt: null,
          reopenedAt: payload.mode === "submit" ? null : editableExisting.reopenedAt,
          adminComment: payload.mode === "submit" ? null : editableExisting.adminComment,
          lineItems: {
            deleteMany: {},
            create: payload.items.map((item) => ({
              projectId: item.projectId,
              languagePairId: item.languagePairId,
              hours: item.hours,
              note: item.note || undefined
            }))
          }
        }
      })
    : await prisma.timesheet.create({
        data: {
          userId: user.id,
          periodStart,
          periodEnd,
          status: payload.mode === "submit" ? "SUBMITTED" : "DRAFT",
          submittedAt: payload.mode === "submit" ? new Date() : null,
          lineItems: {
            create: payload.items.map((item) => ({
              projectId: item.projectId,
              languagePairId: item.languagePairId,
              hours: item.hours,
              note: item.note || undefined
            }))
          }
        }
      });

  await logAudit({
    actorId: user.id,
    targetUserId: user.id,
    action: payload.mode === "submit" ? "TIMESHEET_SUBMITTED" : "TIMESHEET_CREATED",
    entityType: "Timesheet",
    entityId: timesheet.id,
    details: {
      mode: payload.mode,
      itemCount: payload.items.length,
      totalHours: payload.items.reduce((sum, item) => sum + item.hours, 0)
    }
  });

  return NextResponse.redirect(new URL("/translator", request.url));
}
