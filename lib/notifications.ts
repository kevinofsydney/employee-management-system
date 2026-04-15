import { prisma } from "@/lib/db";

/** Create an in-app notification for all admin users. */
export async function notifyAdmins({
  type,
  title,
  message,
  link
}: {
  type: string;
  title: string;
  message: string;
  link?: string;
}) {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { id: true }
  });

  if (admins.length === 0) return;

  await prisma.notification.createMany({
    data: admins.map((admin) => ({
      userId: admin.id,
      type,
      title,
      message,
      link
    }))
  });
}
