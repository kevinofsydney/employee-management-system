import { AuditAction } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { eventSchema } from "@/lib/validators";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const { id } = await params;
  const formData = await request.formData();
  const payload = eventSchema.parse({
    name: formData.get("name"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    city: formData.get("city")
  });

  const event = await prisma.event.update({
    where: { id },
    data: {
      name: payload.name,
      startDate: new Date(payload.startDate),
      endDate: new Date(payload.endDate),
      city: payload.city
    }
  });

  await logAudit({
    actorId: admin.id,
    action: AuditAction.EVENT_UPDATED,
    entityType: "Event",
    entityId: event.id,
    details: { name: payload.name, city: payload.city }
  });

  return NextResponse.redirect(new URL("/admin", request.url));
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const deleteEntries = searchParams.get("deleteEntries") === "true";

  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }

  if (deleteEntries) {
    await prisma.timesheetEntry.deleteMany({ where: { eventId: id } });
  }

  await prisma.event.delete({ where: { id } });

  await logAudit({
    actorId: admin.id,
    action: AuditAction.EVENT_DELETED,
    entityType: "Event",
    entityId: id,
    details: { name: event.name, deletedEntries: deleteEntries }
  });

  return NextResponse.json({ ok: true });
}
