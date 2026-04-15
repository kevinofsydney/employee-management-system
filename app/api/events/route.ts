import { AuditAction } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { eventSchema } from "@/lib/validators";

export async function GET() {
  const events = await prisma.event.findMany({
    where: { isActive: true },
    orderBy: { startDate: "desc" }
  });
  return NextResponse.json(events);
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  const formData = await request.formData();
  const payload = eventSchema.parse({
    name: formData.get("name"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    city: formData.get("city")
  });

  const event = await prisma.event.create({
    data: {
      name: payload.name,
      startDate: new Date(payload.startDate),
      endDate: new Date(payload.endDate),
      city: payload.city
    }
  });

  await logAudit({
    actorId: admin.id,
    action: AuditAction.EVENT_CREATED,
    entityType: "Event",
    entityId: event.id,
    details: { name: payload.name, city: payload.city }
  });

  return NextResponse.redirect(new URL("/admin", request.url));
}
