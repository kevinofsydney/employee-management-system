import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  const admin = await requireAdmin();
  const formData = await request.formData();
  const userId = formData.get("userId")?.toString();
  const status = formData.get("status")?.toString();

  if (!userId || !["ACTIVE", "INACTIVE"].includes(status ?? "")) {
    return NextResponse.json({ error: "Invalid user status request." }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: userId },
    data: { status: status as "ACTIVE" | "INACTIVE" }
  });

  await logAudit({
    actorId: admin.id,
    targetUserId: userId,
    action: status === "ACTIVE" ? "USER_ACTIVATED" : "USER_DEACTIVATED",
    entityType: "User",
    entityId: userId
  });

  return NextResponse.redirect(new URL("/admin", request.url));
}
