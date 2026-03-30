import { NextResponse } from "next/server";

import { requireAppUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { getDriveFileLinks } from "@/lib/drive";

export async function GET(request: Request) {
  const user = await requireAppUser();
  const { searchParams } = new URL(request.url);
  const documentId = searchParams.get("documentId");
  const mode = searchParams.get("mode") === "download" ? "download" : "view";

  if (!documentId) {
    return NextResponse.json({ error: "Missing document ID." }, { status: 400 });
  }

  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: { user: true }
  });

  if (!document || !document.driveFileId) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  const canAccess = user.role === "ADMIN" || document.userId === user.id;
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const links = await getDriveFileLinks(document.driveFileId);
  const target = mode === "download" ? links.downloadLink : links.viewLink;

  if (!target) {
    return NextResponse.json({ error: "Document link unavailable." }, { status: 404 });
  }

  await logAudit({
    actorId: user.id,
    targetUserId: document.userId,
    action: mode === "download" ? "DOCUMENT_DOWNLOADED" : "DOCUMENT_VIEWED",
    entityType: "Document",
    entityId: document.id
  });

  return NextResponse.redirect(target);
}
