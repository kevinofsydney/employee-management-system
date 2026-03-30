import { createHash, randomBytes } from "crypto";

import { env } from "@/lib/env";

export const createOpaqueToken = () => randomBytes(32).toString("hex");

export const hashToken = (token: string) =>
  createHash("sha256").update(`${env.inviteSigningSecret}:${token}`).digest("hex");
