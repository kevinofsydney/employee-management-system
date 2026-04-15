import { AuditAction } from "@prisma/client";
import { stringify } from "csv-stringify/sync";
import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";

export async function GET() {
  const admin = await requireAdmin();

  const users = await prisma.user.findMany({
    where: { role: "TRANSLATOR" },
    include: {
      languagePairs: {
        include: { languagePair: true }
      }
    },
    orderBy: { fullName: "asc" }
  });

  const rows = users.map((user) => ({
    full_name: user.fullName ?? "",
    preferred_name: user.preferredName ?? "",
    email: user.email,
    phone: user.phone ?? "",
    mailing_address: user.mailingAddress ?? "",
    city: user.city ?? "",
    status: user.status,
    years_of_experience: user.yearsOfExperience ?? "",
    certifications: user.certifications ?? "",
    language_pairs: user.languagePairs.map((lp) => lp.languagePair.label).join("; "),
    created_at: user.createdAt.toISOString().slice(0, 10)
  }));

  await logAudit({
    actorId: admin.id,
    action: AuditAction.CSV_EXPORTED,
    entityType: "UserProfileExport",
    entityId: new Date().toISOString(),
    details: { rowCount: rows.length }
  });

  const csv = stringify(rows, { header: true });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="translator-profiles.csv"`
    }
  });
}
