import { NextResponse } from "next/server";

import { requireAppUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { requiredDocumentTypes } from "@/lib/documents";

export async function POST(request: Request) {
  const user = await requireAppUser();
  const documents = await prisma.document.findMany({
    where: {
      userId: user.id,
      type: { in: requiredDocumentTypes }
    }
  });

  const onboarding = await prisma.onboardingSubmission.findUnique({
    where: { userId: user.id }
  });

  const allDocumentsPresent =
    onboarding?.docEmailFallback ||
    requiredDocumentTypes.every((type) =>
      documents.some((document: (typeof documents)[number]) => document.type === type && ["UPLOADED", "ACCEPTED"].includes(document.status))
    );

  if (!allDocumentsPresent || !onboarding?.signatureTimestamp || !onboarding.profileCompletedAt) {
    return NextResponse.json({ error: "Onboarding is incomplete." }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.onboardingSubmission.update({
      where: { userId: user.id },
      data: {
        submittedAt: new Date()
      }
    }),
    prisma.user.update({
      where: { id: user.id },
      data: {
        status: "SUBMITTED_FOR_REVIEW"
      }
    })
  ]);

  await logAudit({
    actorId: user.id,
    targetUserId: user.id,
    action: "ONBOARDING_SUBMITTED",
    entityType: "OnboardingSubmission",
    entityId: user.id
  });

  return NextResponse.redirect(new URL("/translator", request.url));
}
