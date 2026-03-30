import { TimesheetStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { sendTransactionalEmail } from "@/lib/email";
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
    where: { id: payload.timesheetId },
    include: {
      user: true
    }
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

  const subject =
    payload.action === "approve"
      ? "Your Courant timesheet was approved"
      : payload.action === "reject"
        ? "Your Courant timesheet needs revision"
        : "Your Courant timesheet was reopened";

  await sendTransactionalEmail({
    to: timesheet.user.email,
    subject,
    html: `<p>Your timesheet for ${timesheet.periodStart.toISOString().slice(0, 10)} to ${timesheet.periodEnd.toISOString().slice(0, 10)} is now marked as ${nextState.status}.</p>${payload.comment ? `<p>Admin note: ${payload.comment}</p>` : ""}<p><a href="${new URL("/translator", request.url).toString()}">Open timesheets</a></p>`
  });

  return NextResponse.redirect(new URL("/admin", request.url));
}
