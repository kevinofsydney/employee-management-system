import { NextResponse } from "next/server";

import { requireAppUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

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
  const body = await request.json();
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
