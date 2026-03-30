import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  await requireAdmin();
  const formData = await request.formData();
  const startDay = Number(formData.get("startDay"));

  if (!Number.isInteger(startDay) || startDay < 0 || startDay > 6) {
    return NextResponse.json({ error: "Invalid start day." }, { status: 400 });
  }

  await prisma.appConfig.upsert({
    where: { key: "pay_period_start_day" },
    update: { value: String(startDay) },
    create: { key: "pay_period_start_day", value: String(startDay) }
  });

  return NextResponse.redirect(new URL("/admin", request.url));
}
