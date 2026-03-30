import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createOpaqueToken, hashToken } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { sendTransactionalEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { inviteSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const admin = await requireAdmin();
  const formData = await request.formData();
  const payload = inviteSchema.parse({
    email: formData.get("email")
  });

  const token = createOpaqueToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);

  const invite = await prisma.invite.create({
    data: {
      email: payload.email.toLowerCase(),
      tokenHash,
      invitedById: admin.id,
      expiresAt
    }
  });

  const inviteUrl = `${env.appUrl}/invite/${token}`;

  await sendTransactionalEmail({
    to: payload.email,
    subject: "Your Courant onboarding invite",
    html: `<p>Welcome to Courant.</p><p>Use this secure onboarding link: <a href="${inviteUrl}">${inviteUrl}</a></p>`
  });

  await logAudit({
    actorId: admin.id,
    action: "INVITE_SENT",
    entityType: "Invite",
    entityId: invite.id,
    details: { email: payload.email }
  });

  return NextResponse.redirect(new URL("/admin", request.url));
}
