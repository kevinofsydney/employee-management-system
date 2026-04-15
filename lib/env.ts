const required = (name: string, value?: string) => {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

export const env = {
  appUrl: required("NEXT_PUBLIC_APP_URL", process.env.NEXT_PUBLIC_APP_URL),
  adminEmails: (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
  inviteSigningSecret: required("INVITE_SIGNING_SECRET", process.env.INVITE_SIGNING_SECRET),
  googleDriveSharedDriveId: required("GOOGLE_DRIVE_SHARED_DRIVE_ID", process.env.GOOGLE_DRIVE_SHARED_DRIVE_ID),
  googleDriveRootFolderId: required("GOOGLE_DRIVE_ROOT_FOLDER_ID", process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID),
  googleServiceAccountEmail: required("GOOGLE_SERVICE_ACCOUNT_EMAIL", process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL),
  googleServiceAccountPrivateKey: required(
    "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
    process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n")
  ),
  clerkWebhookSecret: process.env.CLERK_WEBHOOK_SECRET,
  jobRunnerSecret: process.env.JOB_RUNNER_SECRET,
  malwareScanApiUrl: process.env.MALWARE_SCAN_API_URL,
  malwareScanApiKey: process.env.MALWARE_SCAN_API_KEY,
  malwareScanFailClosed: process.env.MALWARE_SCAN_FAIL_CLOSED === "true"
};
