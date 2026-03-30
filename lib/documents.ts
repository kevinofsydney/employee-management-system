import { DocumentType } from "@prisma/client";

import { env } from "@/lib/env";

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

export const scanFile = async (bytes: Buffer) => {
  if (!env.malwareScanApiUrl) {
    return { clean: true as const, source: "stub" as const };
  }

  try {
    const response = await fetch(env.malwareScanApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        ...(env.malwareScanApiKey ? { Authorization: `Bearer ${env.malwareScanApiKey}` } : {})
      },
      body: new Uint8Array(bytes)
    });

    if (!response.ok) {
      throw new Error(`Malware scan request failed with status ${response.status}.`);
    }

    const result = (await response.json()) as { clean?: boolean; threat?: string };
    return {
      clean: Boolean(result.clean),
      threat: result.threat,
      source: "api" as const
    };
  } catch (error) {
    if (env.malwareScanFailClosed) {
      return {
        clean: false as const,
        threat: error instanceof Error ? error.message : "Unknown malware scan failure",
        source: "api-fail-closed" as const
      };
    }

    return {
      clean: true as const,
      source: "api-fail-open" as const
    };
  }
};
