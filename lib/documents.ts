import { DocumentType } from "@prisma/client";

const allowedMimeTypes = ["application/pdf", "image/png", "image/jpeg"];
const allowedExtensions = [".pdf", ".png", ".jpg", ".jpeg"];
const maxFileBytes = 10 * 1024 * 1024;

export const requiredDocumentTypes: DocumentType[] = [
  "EMPLOYEE_CONTRACT",
  "SERVICES_CONFIDENTIALITY_AGREEMENT",
  "TFN_DECLARATION",
  "SUPERANNUATION_DETAILS",
  "SUPER_FUND_CONSENT"
];

export const documentLabels: Record<DocumentType, string> = {
  EMPLOYEE_CONTRACT: "Employee contract",
  SERVICES_CONFIDENTIALITY_AGREEMENT: "Services confidentiality agreement",
  TFN_DECLARATION: "Tax File Number declaration",
  SUPERANNUATION_DETAILS: "Superannuation details form",
  SUPER_FUND_CONSENT: "Letter of consent from super fund"
};

export const validateDocumentUpload = (file: File) => {
  const fileName = file.name.toLowerCase();
  const hasAllowedExtension = allowedExtensions.some((extension) => fileName.endsWith(extension));

  if (!allowedMimeTypes.includes(file.type) || !hasAllowedExtension) {
    throw new Error("Only PDF, PNG, and JPG files are allowed.");
  }

  if (file.size > maxFileBytes) {
    throw new Error("Files must be 10 MB or smaller.");
  }
};

export const scanFile = async (_bytes: Buffer) => {
  return { clean: true as const };
};
