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

  const events = [
    { name: "Sydney Conference 2026", startDate: new Date("2026-05-01"), endDate: new Date("2026-05-03"), city: "Sydney" },
    { name: "Melbourne Legal Summit", startDate: new Date("2026-06-10"), endDate: new Date("2026-06-12"), city: "Melbourne" },
    { name: "Brisbane Trade Expo", startDate: new Date("2026-07-15"), endDate: new Date("2026-07-17"), city: "Brisbane" }
  ];

  const hourlyRates = [
    { rateType: "STANDARD", amount: 45.00 },
    { rateType: "SUNDAY", amount: 67.50 },
    { rateType: "OVERTIME", amount: 67.50 },
    { rateType: "PUBLIC_HOLIDAY", amount: 90.00 }
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

  for (const event of events) {
    const existing = await prisma.event.findFirst({ where: { name: event.name } });
    if (!existing) {
      await prisma.event.create({ data: event });
    }
  }

  for (const rate of hourlyRates) {
    await prisma.hourlyRate.upsert({
      where: { rateType: rate.rateType },
      update: { amount: rate.amount },
      create: { rateType: rate.rateType, amount: rate.amount }
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

  console.log(`Seeded ${projects.length} projects, ${languagePairs.length} language pairs, ${events.length} events, ${hourlyRates.length} hourly rates, and ${adminEmails.length} admin records.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
