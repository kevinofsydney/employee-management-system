import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { userCreateSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const admin = await requireAdmin();
  const formData = await request.formData();
  const languagePairIds = formData.getAll("languagePairIds").map(String).filter(Boolean);

  const payload = userCreateSchema.parse({
    email: formData.get("email"),
    fullName: formData.get("fullName"),
    preferredName: formData.get("preferredName") || undefined,
    phone: formData.get("phone") || undefined,
    mailingAddress: formData.get("mailingAddress") || undefined,
    city: formData.get("city") || undefined,
    tfn: formData.get("tfn") || undefined,
    bsb: formData.get("bsb") || undefined,
    yearsOfExperience: formData.get("yearsOfExperience") || undefined,
    certifications: formData.get("certifications") || undefined,
    languagePairIds: languagePairIds.length > 0 ? languagePairIds : undefined
  });

  const existing = await prisma.user.findUnique({ where: { email: payload.email } });
  if (existing) {
    return NextResponse.json({ error: "A user with this email already exists." }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: {
      clerkUserId: `manual-${Date.now()}`,
      email: payload.email,
      fullName: payload.fullName,
      preferredName: payload.preferredName,
      phone: payload.phone,
      mailingAddress: payload.mailingAddress,
      city: payload.city,
      tfn: payload.tfn,
      bsb: payload.bsb,
      yearsOfExperience: payload.yearsOfExperience,
      certifications: payload.certifications,
      role: "TRANSLATOR",
      status: "ONBOARDING_IN_PROGRESS",
      ...(payload.languagePairIds && {
        languagePairs: {
          create: payload.languagePairIds.map((id) => ({ languagePairId: id }))
        }
      })
    }
  });

  await logAudit({
    actorId: admin.id,
    targetUserId: user.id,
    action: "INVITE_SENT",
    entityType: "User",
    entityId: user.id,
    details: { manualCreation: true }
  });

  return NextResponse.redirect(new URL("/admin", request.url));
}
