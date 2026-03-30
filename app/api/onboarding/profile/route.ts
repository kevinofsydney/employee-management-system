import { NextResponse } from "next/server";

import { requireAppUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { profileSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const user = await requireAppUser();
  const formData = await request.formData();
  const payload = profileSchema.parse({
    fullName: formData.get("fullName"),
    preferredName: formData.get("preferredName"),
    phone: formData.get("phone"),
    mailingAddress: formData.get("mailingAddress"),
    yearsOfExperience: formData.get("yearsOfExperience"),
    certifications: formData.get("certifications"),
    languagePairIds: formData.getAll("languagePairIds"),
    privacyAccepted: formData.get("privacyAccepted") === "on"
  });

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        fullName: payload.fullName,
        preferredName: payload.preferredName,
        phone: payload.phone,
        mailingAddress: payload.mailingAddress,
        yearsOfExperience: payload.yearsOfExperience,
        certifications: payload.certifications,
        privacyAcceptedAt: payload.privacyAccepted ? new Date() : undefined,
        status: "ONBOARDING_IN_PROGRESS",
        languagePairs: {
          deleteMany: {},
          createMany: {
            data: payload.languagePairIds.map((languagePairId) => ({ languagePairId }))
          }
        }
      }
    }),
    prisma.onboardingSubmission.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        currentStep: "DOCUMENTS",
        profileCompletedAt: new Date()
      },
      update: {
        currentStep: "DOCUMENTS",
        profileCompletedAt: new Date()
      }
    })
  ]);

  await logAudit({
    actorId: user.id,
    targetUserId: user.id,
    action: "ONBOARDING_STEP_SAVED",
    entityType: "OnboardingSubmission",
    entityId: user.id,
    details: { step: "PROFILE" }
  });

  return NextResponse.redirect(new URL("/translator", request.url));
}
