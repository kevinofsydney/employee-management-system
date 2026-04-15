import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAppUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

const markReadSchema = z.object({
  notificationId: z.union([z.literal("all"), z.string().min(1)])
});

export async function GET() {
  const user = await requireAppUser();
  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50
  });
  return NextResponse.json(notifications);
}

export async function POST(request: Request) {
  const user = await requireAppUser();
  const body = markReadSchema.parse(await request.json());
  const { notificationId } = body;

  if (notificationId === "all") {
    await prisma.notification.updateMany({
      where: { userId: user.id, isRead: false },
      data: { isRead: true }
    });
  } else if (notificationId) {
    await prisma.notification.update({
      where: { id: notificationId, userId: user.id },
      data: { isRead: true }
    });
  }

  return NextResponse.json({ ok: true });
}
