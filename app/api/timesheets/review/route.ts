import { AuditAction, TimesheetEntryStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { sendTransactionalEmail } from "@/lib/email";
import { reviewEntrySchema } from "@/lib/validators";

export async function POST(request: Request) {
  const admin = await requireAdmin();
  const formData = await request.formData();
  const payload = reviewEntrySchema.parse({
    entryId: formData.get("entryId"),
    action: formData.get("action"),
    comment: formData.get("comment")
  });

  const entry = await prisma.timesheetEntry.findUnique({
    where: { id: payload.entryId },
    include: { user: true, event: true }
  });

  if (!entry) {
    return NextResponse.json({ error: "Entry not found." }, { status: 404 });
  }

  if (payload.action === "reject" && !payload.comment) {
    return NextResponse.json({ error: "Rejecting an entry requires a comment." }, { status: 400 });
  }

  const nextState =
    payload.action === "approve"
      ? { status: TimesheetEntryStatus.APPROVED, reviewedAt: new Date(), adminComment: null }
      : { status: TimesheetEntryStatus.REJECTED, reviewedAt: new Date(), adminComment: payload.comment ?? null };

  await prisma.timesheetEntry.update({
    where: { id: entry.id },
    data: nextState
  });

  await logAudit({
    actorId: admin.id,
    targetUserId: entry.userId,
    action: payload.action === "approve" ? AuditAction.TIMESHEET_APPROVED : AuditAction.TIMESHEET_REJECTED,
    entityType: "TimesheetEntry",
    entityId: entry.id,
    details: { comment: payload.comment }
  });

  const dateStr = entry.date.toISOString().slice(0, 10);
  const subject =
    payload.action === "approve"
      ? "Your Courant timesheet entry was approved"
      : "Your Courant timesheet entry needs revision";

  await sendTransactionalEmail({
    to: entry.user.email,
    subject,
    html: `<p>Your timesheet entry for ${entry.event.name} on ${dateStr} (${Number(entry.hours).toFixed(2)}h) is now ${nextState.status}.</p>${payload.comment ? `<p>Admin note: ${payload.comment}</p>` : ""}<p><a href="${new URL("/translator", request.url).toString()}">Open timesheets</a></p>`
  });

  return NextResponse.redirect(new URL("/admin", request.url));
}
