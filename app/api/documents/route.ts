import { DocumentType } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireAppUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { scanFile, validateDocumentUpload } from "@/lib/documents";
import { uploadDocumentToDrive } from "@/lib/drive";

export async function POST(request: Request) {
  const user = await requireAppUser();
  const formData = await request.formData();
  const type = formData.get("type");
  const file = formData.get("file");

  if (!type || !file || !(file instanceof File)) {
    return NextResponse.json({ error: "Missing document type or file." }, { status: 400 });
  }

  const documentType = type.toString() as DocumentType;
  validateDocumentUpload(file);

  const bytes = Buffer.from(await file.arrayBuffer());
  const scanResult = await scanFile(bytes);

  if (!scanResult.clean) {
    await prisma.document.upsert({
      where: {
        userId_type: {
          userId: user.id,
          type: documentType
        }
      },
      create: {
        userId: user.id,
        type: documentType,
        status: "QUARANTINED",
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size
      },
      update: {
        status: "QUARANTINED",
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size
      }
    });

    return NextResponse.json({ error: "File scan failed." }, { status: 400 });
  }

  const upload = await uploadDocumentToDrive({
    email: user.email,
    documentType,
    fileName: file.name,
    mimeType: file.type,
    bytes
  });

  const document = await prisma.document.upsert({
    where: {
      userId_type: {
        userId: user.id,
        type: documentType
      }
    },
    create: {
      userId: user.id,
      type: documentType,
      status: "UPLOADED",
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      driveFileId: upload.fileId,
      driveFolderId: upload.folderId,
      driveViewLink: upload.viewLink,
      uploadedAt: new Date()
    },
    update: {
      status: "UPLOADED",
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      driveFileId: upload.fileId,
      driveFolderId: upload.folderId,
      driveViewLink: upload.viewLink,
      uploadedAt: new Date(),
      adminComment: null
    }
  });

  await prisma.onboardingSubmission.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      currentStep: "DOCUMENTS",
      documentsCompletedAt: new Date()
    },
    update: {
      currentStep: "DOCUMENTS",
      documentsCompletedAt: new Date()
    }
  });

  await logAudit({
    actorId: user.id,
    targetUserId: user.id,
    action: "DOCUMENT_UPLOADED",
    entityType: "Document",
    entityId: document.id,
    details: { type: documentType, sizeBytes: file.size }
  });

  return NextResponse.redirect(new URL("/translator", request.url));
}
