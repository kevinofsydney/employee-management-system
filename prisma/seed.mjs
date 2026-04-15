import { PrismaClient, AppRole, AccountStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

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

  console.log(`Seeded ${languagePairs.length} language pairs, ${events.length} events, ${hourlyRates.length} hourly rates, and ${adminEmails.length} admin records.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
