import { AccountStatus, AuditAction } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { sendTransactionalEmail } from "@/lib/email";

const allowedStatusTransitions = [AccountStatus.ACTIVE, AccountStatus.INACTIVE] as const;
type StatusTransition = (typeof allowedStatusTransitions)[number];

function isAllowedStatus(value: string): value is StatusTransition {
  return (allowedStatusTransitions as readonly string[]).includes(value);
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  const formData = await request.formData();
  const userId = formData.get("userId")?.toString();
  const statusRaw = formData.get("status")?.toString();

  if (!userId || !statusRaw || !isAllowedStatus(statusRaw)) {
    return NextResponse.json({ error: "Invalid user status request." }, { status: 400 });
  }

  const status: StatusTransition = statusRaw;

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { status }
  });

  await logAudit({
    actorId: admin.id,
    targetUserId: userId,
    action: status === "ACTIVE" ? AuditAction.USER_ACTIVATED : AuditAction.USER_DEACTIVATED,
    entityType: "User",
    entityId: userId
  });

  await sendTransactionalEmail({
    to: updatedUser.email,
    subject: status === "ACTIVE" ? "Your Courant account is active" : "Your Courant account was deactivated",
    html:
      status === "ACTIVE"
        ? `<p>Your Courant account has been activated. You can now submit timesheets.</p><p><a href="${new URL("/translator", request.url).toString()}">Open your dashboard</a></p>`
        : `<p>Your Courant account has been deactivated. Historical records remain preserved, but timesheet submission is disabled.</p>`
  });

  return NextResponse.redirect(new URL("/admin", request.url));
}
