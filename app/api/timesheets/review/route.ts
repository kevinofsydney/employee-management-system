import { TimesheetStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { reviewTimesheetSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const admin = await requireAdmin();
  const formData = await request.formData();
  const payload = reviewTimesheetSchema.parse({
    timesheetId: formData.get("timesheetId"),
    action: formData.get("action"),
    comment: formData.get("comment")
  });

  const timesheet = await prisma.timesheet.findUnique({
    where: { id: payload.timesheetId }
  });

  if (!timesheet) {
    return NextResponse.json({ error: "Timesheet not found." }, { status: 404 });
  }

  if (payload.action === "reject" && !payload.comment) {
    return NextResponse.json({ error: "Rejecting a timesheet requires a comment." }, { status: 400 });
  }

  const nextState =
    payload.action === "approve"
      ? { status: TimesheetStatus.APPROVED, reviewedAt: new Date(), adminComment: null, reopenedAt: null }
      : payload.action === "reject"
        ? { status: TimesheetStatus.REJECTED, reviewedAt: new Date(), adminComment: payload.comment ?? null }
        : { status: TimesheetStatus.DRAFT, reopenedAt: new Date(), adminComment: payload.comment ?? null };

  await prisma.timesheet.update({
    where: { id: timesheet.id },
    data: nextState
  });

  await logAudit({
    actorId: admin.id,
    targetUserId: timesheet.userId,
    action:
      payload.action === "approve"
        ? "TIMESHEET_APPROVED"
        : payload.action === "reject"
          ? "TIMESHEET_REJECTED"
          : "TIMESHEET_REOPENED",
    entityType: "Timesheet",
    entityId: timesheet.id,
    details: { comment: payload.comment }
  });

  return NextResponse.redirect(new URL("/admin", request.url));
}
