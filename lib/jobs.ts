import { AccountStatus, AuditAction } from "@prisma/client";

import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { sendAdminNotification, sendTransactionalEmail } from "@/lib/email";
import { env } from "@/lib/env";

const dayMs = 1000 * 60 * 60 * 24;

export const runInviteExpiryJob = async () => {
  const now = new Date();
  const expiredInvites = await prisma.invite.findMany({
    where: {
      status: "PENDING",
      expiresAt: { lt: now }
    },
    include: {
      invitedUser: true
    }
  });

  for (const invite of expiredInvites) {
    await prisma.$transaction([
      prisma.invite.update({
        where: { id: invite.id },
        data: { status: "EXPIRED" }
      }),
      ...(invite.invitedUserId
        ? [
            prisma.user.update({
              where: { id: invite.invitedUserId },
              data: {
                status: AccountStatus.EXPIRED
              }
            })
          ]
        : [])
    ]);
  }

  if (expiredInvites.length > 0) {
    await sendAdminNotification({
      subject: "Courant onboarding invites expired",
      html: `<p>${expiredInvites.length} onboarding invite(s) have expired and may need to be reissued.</p><p><a href="${env.appUrl}/admin">Open admin dashboard</a></p>`
    });
  }

  return { expiredInvites: expiredInvites.length };
};

export const runOnboardingReminderJob = async () => {
  const reminderThreshold = new Date(Date.now() - 7 * dayMs);
  const users = await prisma.user.findMany({
    where: {
      role: "TRANSLATOR",
      status: { in: [AccountStatus.INVITED, AccountStatus.ONBOARDING_IN_PROGRESS] },
      createdAt: { lt: reminderThreshold }
    }
  });

  for (const user of users) {
    await sendTransactionalEmail({
      to: user.email,
      subject: "Reminder: finish your Courant onboarding",
      html: `<p>Please return to the Courant onboarding portal and complete your remaining onboarding steps.</p><p><a href="${env.appUrl}/translator">Open onboarding</a></p>`
    });
    await logAudit({
      targetUserId: user.id,
      action: AuditAction.REMINDER_EMAIL_SENT,
      entityType: "User",
      entityId: user.id,
      details: { reminderType: "onboarding" }
    });
  }

  return { onboardingRemindersSent: users.length };
};

export const runTimesheetReminderJob = async () => {
  const activeUsers = await prisma.user.findMany({
    where: {
      role: "TRANSLATOR",
      status: AccountStatus.ACTIVE
    }
  });

  let remindersSent = 0;
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * dayMs);

  for (const user of activeUsers) {
    const recentEntry = await prisma.timesheetEntry.findFirst({
      where: {
        userId: user.id,
        submittedAt: { gte: sevenDaysAgo }
      }
    });

    if (recentEntry) {
      continue;
    }

    await sendTransactionalEmail({
      to: user.email,
      subject: "Reminder: submit your Courant timesheet entries",
      html: `<p>This is your reminder to submit your Courant timesheet entries for recent events.</p><p><a href="${env.appUrl}/translator">Open timesheets</a></p>`
    });
    await logAudit({
      targetUserId: user.id,
      action: AuditAction.REMINDER_EMAIL_SENT,
      entityType: "User",
      entityId: user.id,
      details: { reminderType: "timesheet" }
    });
    remindersSent += 1;
  }

  return { timesheetRemindersSent: remindersSent };
};

export const runAllJobs = async () => {
  const [inviteExpiry, onboardingReminders, timesheetReminders] = await Promise.all([
    runInviteExpiryJob(),
    runOnboardingReminderJob(),
    runTimesheetReminderJob()
  ]);

  await logAudit({
    action: AuditAction.JOB_RUN_COMPLETED,
    entityType: "JobRunner",
    entityId: new Date().toISOString(),
    details: {
      inviteExpiry,
      onboardingReminders,
      timesheetReminders
    }
  });

  return {
    inviteExpiry,
    onboardingReminders,
    timesheetReminders
  };
};
