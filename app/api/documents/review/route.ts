import { AuditAction, DocumentStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { sendTransactionalEmail } from "@/lib/email";

export async function POST(request: Request) {
  const admin = await requireAdmin();
  const formData = await request.formData();
  const documentId = formData.get("documentId")?.toString();
  const action = formData.get("action")?.toString();
  const comment = formData.get("comment")?.toString() ?? null;

  if (!documentId || !["accept", "resubmit"].includes(action ?? "")) {
    return NextResponse.json({ error: "Invalid document review request." }, { status: 400 });
  }

  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: {
      user: {
        select: {
          email: true
        }
      }
    }
  });

  if (!document) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  if (action === "resubmit" && !comment) {
    return NextResponse.json({ error: "A resubmission request requires a comment." }, { status: 400 });
  }

  await prisma.document.update({
    where: { id: documentId },
    data: {
      status: action === "accept" ? DocumentStatus.ACCEPTED : DocumentStatus.RESUBMISSION_REQUESTED,
      acceptedAt: action === "accept" ? new Date() : null,
      requestedAt: action === "resubmit" ? new Date() : null,
      adminComment: action === "resubmit" ? comment : null
    }
  });

  await logAudit({
    actorId: admin.id,
    targetUserId: document.userId,
    action: action === "accept" ? AuditAction.DOCUMENT_ACCEPTED : AuditAction.DOCUMENT_RESUBMISSION_REQUESTED,
    entityType: "Document",
    entityId: documentId,
    details: { comment }
  });

  await sendTransactionalEmail({
    to: document.user.email,
    subject: action === "accept" ? "A Courant document was accepted" : "A Courant document needs resubmission",
    html:
      action === "accept"
        ? `<p>Your uploaded document has been accepted.</p><p><a href="${new URL("/translator", request.url).toString()}">Open onboarding</a></p>`
        : `<p>Please re-upload the requested onboarding document.</p><p>Admin note: ${comment}</p><p><a href="${new URL("/translator", request.url).toString()}">Open onboarding</a></p>`
  });

  return NextResponse.redirect(new URL("/admin", request.url));
}
