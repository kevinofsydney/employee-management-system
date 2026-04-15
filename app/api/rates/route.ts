import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateSchema } from "@/lib/validators";

export async function GET() {
  const rates = await prisma.hourlyRate.findMany({
    orderBy: { rateType: "asc" }
  });
  return NextResponse.json(rates);
}

export async function POST(request: Request) {
  await requireAdmin();
  const formData = await request.formData();
  const payload = rateSchema.parse({
    rateType: formData.get("rateType"),
    amount: formData.get("amount")
  });

  await prisma.hourlyRate.upsert({
    where: { rateType: payload.rateType },
    update: { amount: payload.amount },
    create: { rateType: payload.rateType, amount: payload.amount }
  });

  return NextResponse.redirect(new URL("/admin", request.url));
}
