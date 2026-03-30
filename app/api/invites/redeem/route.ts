import { NextResponse } from "next/server";

import { requireAppUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { hashToken } from "@/lib/crypto";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const user = await requireAppUser();
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  const invite = await prisma.invite.findUnique({
    where: { tokenHash: hashToken(token) }
  });

  if (!invite || invite.status !== "PENDING" || invite.expiresAt < new Date()) {
    return NextResponse.redirect(new URL("/sign-in?error=invalid_invite", request.url));
  }

  if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
    return NextResponse.redirect(new URL("/sign-in?error=email_mismatch", request.url));
  }

  await prisma.$transaction([
    prisma.invite.update({
      where: { id: invite.id },
      data: {
        status: "REDEEMED",
        redeemedAt: new Date(),
        invitedUserId: user.id
      }
    }),
    prisma.user.update({
      where: { id: user.id },
      data: {
        status: user.status === "INVITED" ? "ONBOARDING_IN_PROGRESS" : user.status,
        onboarding: {
          upsert: {
            create: {},
            update: {}
          }
        }
      }
    })
  ]);

  await logAudit({
    actorId: user.id,
    targetUserId: user.id,
    action: "INVITE_REDEEMED",
    entityType: "Invite",
    entityId: invite.id
  });

  return NextResponse.redirect(new URL("/translator", request.url));
}
