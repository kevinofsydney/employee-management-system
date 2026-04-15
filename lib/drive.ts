import { Readable } from "stream";

import { DocumentType } from "@prisma/client";
import { google } from "googleapis";

import { env } from "@/lib/env";

const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive"];

const getDriveClient = () => {
  const auth = new google.auth.JWT({
    email: env.googleServiceAccountEmail,
    key: env.googleServiceAccountPrivateKey,
    scopes: DRIVE_SCOPES
  });

  return google.drive({
    version: "v3",
    auth
  });
};

const sanitizeFileName = (value: string) => value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");

const ensureTranslatorFolder = async (email: string) => {
  const drive = getDriveClient();
  const folderName = `translator-${sanitizeFileName(email.toLowerCase())}`;

  const existing = await drive.files.list({
    corpora: "drive",
    driveId: env.googleDriveSharedDriveId,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    q: [
      `'${env.googleDriveRootFolderId}' in parents`,
      `name = '${folderName}'`,
      `mimeType = 'application/vnd.google-apps.folder'`,
      "trashed = false"
    ].join(" and "),
    fields: "files(id)"
  });

  if (existing.data.files?.[0]?.id) {
    return existing.data.files[0].id;
  }

  const created = await drive.files.create({
    supportsAllDrives: true,
    requestBody: {
      name: folderName,
      parents: [env.googleDriveRootFolderId],
      mimeType: "application/vnd.google-apps.folder"
    },
    fields: "id"
  });

  if (!created.data.id) {
    throw new Error("Failed to create Google Drive folder.");
  }

  return created.data.id;
};

export const uploadDocumentToDrive = async ({
  email,
  documentType,
  fileName,
  mimeType,
  bytes
}: {
  email: string;
  documentType: DocumentType;
  fileName: string;
  mimeType: string;
  bytes: Buffer;
}) => {
  const drive = getDriveClient();
  const folderId = await ensureTranslatorFolder(email);
  const safeName = `${documentType}-${Date.now()}-${sanitizeFileName(fileName)}`;

  const uploaded = await drive.files.create({
    supportsAllDrives: true,
    requestBody: {
      name: safeName,
      parents: [folderId]
    },
    media: {
      mimeType,
      body: Readable.from(bytes)
    },
    fields: "id, webViewLink, webContentLink"
  });

  if (!uploaded.data.id) {
    throw new Error("Google Drive upload failed.");
  }

  return {
    folderId,
    fileId: uploaded.data.id,
    viewLink: uploaded.data.webViewLink ?? null,
    downloadLink: uploaded.data.webContentLink ?? null
  };
};

export const getDriveFileLinks = async (fileId: string) => {
  const drive = getDriveClient();
  const file = await drive.files.get({
    fileId,
    supportsAllDrives: true,
    fields: "id, webViewLink, webContentLink"
  });

  return {
    viewLink: file.data.webViewLink ?? null,
    downloadLink: file.data.webContentLink ?? null
  };
};
