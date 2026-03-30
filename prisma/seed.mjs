import { PrismaClient, AppRole, AccountStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  const projects = [
    "Courant Internal",
    "Client Alpha",
    "Client Bravo",
    "Client Charlie"
  ];

  const languagePairs = [
    "English -> Japanese",
    "Japanese -> English",
    "English -> French",
    "French -> English",
    "English -> Mandarin",
    "Mandarin -> English"
  ];

  for (const name of projects) {
    await prisma.project.upsert({
      where: { name },
      update: { isActive: true },
      create: { name, isActive: true }
    });
  }

  for (const label of languagePairs) {
    await prisma.languagePair.upsert({
      where: { label },
      update: { isActive: true },
      create: { label, isActive: true }
    });
  }

  await prisma.appConfig.upsert({
    where: { key: "pay_period_start_day" },
    update: { value: process.env.DEFAULT_PAY_PERIOD_START_DAY ?? "1" },
    create: { key: "pay_period_start_day", value: process.env.DEFAULT_PAY_PERIOD_START_DAY ?? "1" }
  });

  for (const email of adminEmails) {
    await prisma.user.upsert({
      where: { email },
      update: {
        role: AppRole.ADMIN,
        status: AccountStatus.ACTIVE
      },
      create: {
        clerkUserId: `seed-${email}`,
        email,
        role: AppRole.ADMIN,
        status: AccountStatus.ACTIVE,
        fullName: email.split("@")[0]
      }
    });
  }

  console.log(`Seeded ${projects.length} projects, ${languagePairs.length} language pairs, and ${adminEmails.length} admin records.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
