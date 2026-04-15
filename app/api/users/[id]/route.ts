import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { userUpdateSchema } from "@/lib/validators";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const { id } = await params;
  const formData = await request.formData();
  const languagePairIds = formData.getAll("languagePairIds").map(String).filter(Boolean);

  const payload = userUpdateSchema.parse({
    fullName: formData.get("fullName") || undefined,
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

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  await prisma.user.update({
    where: { id },
    data: {
      ...(payload.fullName && { fullName: payload.fullName }),
      ...(payload.preferredName !== undefined && { preferredName: payload.preferredName }),
      ...(payload.phone !== undefined && { phone: payload.phone }),
      ...(payload.mailingAddress !== undefined && { mailingAddress: payload.mailingAddress }),
      ...(payload.city !== undefined && { city: payload.city }),
      ...(payload.tfn !== undefined && { tfn: payload.tfn }),
      ...(payload.bsb !== undefined && { bsb: payload.bsb }),
      ...(payload.yearsOfExperience !== undefined && { yearsOfExperience: payload.yearsOfExperience }),
      ...(payload.certifications !== undefined && { certifications: payload.certifications }),
      ...(payload.languagePairIds && {
        languagePairs: {
          deleteMany: {},
          create: payload.languagePairIds.map((lpId) => ({ languagePairId: lpId }))
        }
      })
    }
  });

  await logAudit({
    actorId: admin.id,
    targetUserId: id,
    action: "ONBOARDING_STEP_SAVED",
    entityType: "User",
    entityId: id,
    details: { adminEdit: true, fields: Object.keys(payload).filter((k) => payload[k as keyof typeof payload] !== undefined) }
  });

  return NextResponse.redirect(new URL("/admin", request.url));
}
