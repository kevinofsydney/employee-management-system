import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { runAllJobs } from "@/lib/jobs";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = env.jobRunnerSecret ? `Bearer ${env.jobRunnerSecret}` : null;

  if (!expected || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const result = await runAllJobs();
  return NextResponse.json({ ok: true, result });
}
