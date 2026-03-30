import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

export const sendTransactionalEmail = async ({
  to,
  subject,
  html
}: {
  to: string;
  subject: string;
  html: string;
}) => {
  if (!process.env.RESEND_API_KEY) {
    console.info("Email not sent because RESEND_API_KEY is missing.", { to, subject });
    return { skipped: true };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: "Courant Ops <no-reply@courant.example>",
      to,
      subject,
      html
    })
  });

  if (!response.ok) {
    throw new Error(`Email send failed with status ${response.status}.`);
  }

  return response.json();
};

export const sendAdminNotification = async ({
  subject,
  html
}: {
  subject: string;
  html: string;
}) => {
  const adminUsers = await prisma.user.findMany({
    where: {
      role: "ADMIN"
    },
    select: {
      email: true
    }
  });

  const recipients = Array.from(
    new Set([
      ...env.adminEmails,
      ...adminUsers.map((user) => user.email.toLowerCase())
    ])
  );

  await Promise.all(
    recipients.map((email) =>
      sendTransactionalEmail({
        to: email,
        subject,
        html
      })
    )
  );
};
