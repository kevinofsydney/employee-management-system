import { NextResponse } from "next/server";

import { requireAppUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { requiredDocumentTypes } from "@/lib/documents";
import { sendAdminNotification } from "@/lib/email";

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

  await sendAdminNotification({
    subject: "Translator onboarding submitted for review",
    html: `<p>${user.fullName ?? user.email} has submitted onboarding for review.</p><p><a href="${new URL("/admin", request.url).toString()}">Open admin dashboard</a></p>`
  });

  return NextResponse.redirect(new URL("/translator", request.url));
}
