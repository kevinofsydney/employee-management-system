import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

export const getPayPeriodStartDay = async () => {
  const config = await prisma.appConfig.findUnique({
    where: { key: "pay_period_start_day" }
  });

  const parsed = Number(config?.value ?? env.defaultPayPeriodStartDay);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 6 ? parsed : env.defaultPayPeriodStartDay;
};
