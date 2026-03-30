import { auth, clerkClient } from "@clerk/nextjs/server";
import { AppRole } from "@prisma/client";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

export const requireAppUser = async () => {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  let user = await prisma.user.findUnique({
    where: { clerkUserId: userId },
    include: {
      onboarding: true,
      languagePairs: {
        include: {
          languagePair: true
        }
      }
    }
  });

  if (!user) {
    await syncClerkUser(userId);
    user = await prisma.user.findUnique({
      where: { clerkUserId: userId },
      include: {
        onboarding: true,
        languagePairs: {
          include: {
            languagePair: true
          }
        }
      }
    });
  }

  if (!user) {
    throw new Error("Authenticated Clerk user could not be synced into the app database.");
  }

  return user;
};

export const requireAdmin = async () => {
  const user = await requireAppUser();
  if (user.role !== AppRole.ADMIN) {
    redirect("/dashboard");
  }
  return user;
};

export const syncClerkUser = async (clerkUserId: string) => {
  const client = await clerkClient();
  const clerkUser = await client.users.getUser(clerkUserId);
  const primaryEmail = clerkUser.emailAddresses.find(
    (email) => email.id === clerkUser.primaryEmailAddressId
  )?.emailAddress;

  if (!primaryEmail) {
    throw new Error("Clerk user is missing a primary email address.");
  }

  const role = env.adminEmails.includes(primaryEmail.toLowerCase()) ? AppRole.ADMIN : AppRole.TRANSLATOR;

  return prisma.user.upsert({
    where: { clerkUserId },
    create: {
      clerkUserId,
      email: primaryEmail,
      role,
      status: role === AppRole.ADMIN ? "ACTIVE" : "INVITED",
      fullName: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || null,
      preferredName: clerkUser.firstName || null
    },
    update: {
      email: primaryEmail,
      fullName: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || null,
      preferredName: clerkUser.firstName || null
    }
  });
};
