import { AuditAction } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireAppUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { sendAdminNotification, sendTransactionalEmail } from "@/lib/email";
import { notifyAdmins } from "@/lib/notifications";
import { roundStartTime, roundEndTime, calculateHours } from "@/lib/time";
import { timesheetEntrySchema } from "@/lib/validators";

export async function POST(request: Request) {
  const user = await requireAppUser();

  if (user.status !== "ACTIVE") {
    return NextResponse.json({ error: "Only active translators can submit timesheet entries." }, { status: 403 });
  }

  const formData = await request.formData();
  const payload = timesheetEntrySchema.parse({
    eventId: formData.get("eventId"),
    date: formData.get("date"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    rateType: formData.get("rateType"),
    comment: formData.get("comment")
  });

  const event = await prisma.event.findUnique({ where: { id: payload.eventId } });
  if (!event) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }

  const entryDate = new Date(payload.date);
  if (entryDate < event.startDate || entryDate > event.endDate) {
    return NextResponse.json({ error: "Date must fall within the event's date range." }, { status: 400 });
  }

  const roundedStart = roundStartTime(payload.startTime);
  const roundedEnd = roundEndTime(payload.endTime);
  const hours = calculateHours(roundedStart, roundedEnd);

  if (hours <= 0) {
    return NextResponse.json({ error: "End time must be after start time." }, { status: 400 });
  }

  // Duplicate guard: block if approved entry exists for same event + date + overlapping time
  const duplicate = await prisma.timesheetEntry.findFirst({
    where: {
      userId: user.id,
      eventId: payload.eventId,
      date: entryDate,
      startTime: roundedStart,
      endTime: roundedEnd,
      status: "APPROVED"
    }
  });

  if (duplicate) {
    return NextResponse.json({ error: "An approved entry already exists for this event, date, and time range." }, { status: 409 });
  }

  const entry = await prisma.timesheetEntry.create({
    data: {
      userId: user.id,
      eventId: payload.eventId,
      date: entryDate,
      startTime: roundedStart,
      endTime: roundedEnd,
      hours,
      rateType: payload.rateType,
      comment: payload.comment || undefined,
      status: "PENDING",
      submittedAt: new Date()
    }
  });

  await logAudit({
    actorId: user.id,
    targetUserId: user.id,
    action: AuditAction.TIMESHEET_SUBMITTED,
    entityType: "TimesheetEntry",
    entityId: entry.id,
    details: { eventId: payload.eventId, date: payload.date, hours, rateType: payload.rateType }
  });

  await Promise.all([
    sendTransactionalEmail({
      to: user.email,
      subject: "Your Courant timesheet entry was received",
      html: `<p>Your timesheet entry for ${event.name} on ${payload.date} (${hours.toFixed(2)} hours, ${payload.rateType}) has been submitted.</p>`
    }),
    sendAdminNotification({
      subject: "New timesheet entry submitted",
      html: `<p>${user.fullName ?? user.email} submitted a timesheet entry for ${event.name} on ${payload.date} (${hours.toFixed(2)} hours).</p><p><a href="${new URL("/admin", request.url).toString()}">Open review queue</a></p>`
    }),
    notifyAdmins({
      type: "timesheet_submitted",
      title: "Timesheet entry submitted",
      message: `${user.fullName ?? user.email} submitted ${hours.toFixed(2)}h for ${event.name} on ${payload.date}`,
      link: "/admin"
    })
  ]);

  return NextResponse.redirect(new URL("/translator", request.url));
}

export async function PATCH(request: Request) {
  const user = await requireAppUser();

  if (user.status !== "ACTIVE") {
    return NextResponse.json({ error: "Only active translators can edit timesheet entries." }, { status: 403 });
  }

  const formData = await request.formData();
  const entryId = formData.get("entryId")?.toString();

  if (!entryId) {
    return NextResponse.json({ error: "Entry ID required." }, { status: 400 });
  }

  const existing = await prisma.timesheetEntry.findUnique({ where: { id: entryId } });
  if (!existing || existing.userId !== user.id) {
    return NextResponse.json({ error: "Entry not found." }, { status: 404 });
  }

  const payload = timesheetEntrySchema.parse({
    eventId: formData.get("eventId"),
    date: formData.get("date"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    rateType: formData.get("rateType"),
    comment: formData.get("comment")
  });

  const event = await prisma.event.findUnique({ where: { id: payload.eventId } });
  if (!event) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }

  const entryDate = new Date(payload.date);
  if (entryDate < event.startDate || entryDate > event.endDate) {
    return NextResponse.json({ error: "Date must fall within the event's date range." }, { status: 400 });
  }

  const roundedStart = roundStartTime(payload.startTime);
  const roundedEnd = roundEndTime(payload.endTime);
  const hours = calculateHours(roundedStart, roundedEnd);

  if (hours <= 0) {
    return NextResponse.json({ error: "End time must be after start time." }, { status: 400 });
  }

  await prisma.timesheetEntry.update({
    where: { id: entryId },
    data: {
      eventId: payload.eventId,
      date: entryDate,
      startTime: roundedStart,
      endTime: roundedEnd,
      hours,
      rateType: payload.rateType,
      comment: payload.comment || undefined,
      status: "PENDING",
      submittedAt: new Date(),
      reviewedAt: null,
      adminComment: null
    }
  });

  return NextResponse.redirect(new URL("/translator", request.url));
}
