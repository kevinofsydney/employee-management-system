import { AuditAction } from "@prisma/client";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { requireAppUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { agreementSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const user = await requireAppUser();
  const formData = await request.formData();
  const payload = agreementSchema.parse({
    signatureName: formData.get("signatureName"),
    consentGiven: formData.get("consentGiven") === "on"
  });
  const headerStore = await headers();

  await prisma.onboardingSubmission.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      currentStep: "CONFIRMATION",
      agreementsCompletedAt: new Date(),
      signatureName: payload.signatureName,
      signatureIp: headerStore.get("x-forwarded-for") ?? "unknown",
      signatureTimestamp: new Date()
    },
    update: {
      currentStep: "CONFIRMATION",
      agreementsCompletedAt: new Date(),
      signatureName: payload.signatureName,
      signatureIp: headerStore.get("x-forwarded-for") ?? "unknown",
      signatureTimestamp: new Date()
    }
  });

  await logAudit({
    actorId: user.id,
    targetUserId: user.id,
    action: AuditAction.ONBOARDING_STEP_SAVED,
    entityType: "OnboardingSubmission",
    entityId: user.id,
    details: { step: "AGREEMENTS" }
  });

  return NextResponse.redirect(new URL("/translator", request.url));
}
