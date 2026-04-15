import { AppRole } from "@prisma/client";
import { redirect } from "next/navigation";

import { requireAppUser } from "@/lib/auth";

export default async function DashboardRouter() {
  const user = await requireAppUser();
  redirect(user.role === AppRole.ADMIN ? "/admin" : "/translator");
}
