import { AuditAction } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireAppUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  const user = await requireAppUser();
  const formData = await request.formData();
  const declared = formData.get("declared") === "true";

  await prisma.onboardingSubmission.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      currentStep: "DOCUMENTS",
      docEmailFallback: declared
    },
    update: {
      currentStep: "DOCUMENTS",
      docEmailFallback: declared
    }
  });

  await logAudit({
    actorId: user.id,
    targetUserId: user.id,
    action: AuditAction.ONBOARDING_STEP_SAVED,
    entityType: "OnboardingSubmission",
    entityId: user.id,
    details: {
      step: "DOCUMENTS",
      docEmailFallback: declared
    }
  });

  return NextResponse.redirect(new URL("/translator", request.url));
}
