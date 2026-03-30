import { headers } from "next/headers";
import { Webhook } from "svix";

import { syncClerkUser } from "@/lib/auth";
import { env } from "@/lib/env";

export async function POST(request: Request) {
  if (!env.clerkWebhookSecret) {
    return new Response("Missing webhook secret.", { status: 500 });
  }

  const payload = await request.text();
  const headerStore = await headers();
  const svixId = headerStore.get("svix-id");
  const svixTimestamp = headerStore.get("svix-timestamp");
  const svixSignature = headerStore.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response("Missing webhook headers.", { status: 400 });
  }

  const webhook = new Webhook(env.clerkWebhookSecret);
  const event = webhook.verify(payload, {
    "svix-id": svixId,
    "svix-timestamp": svixTimestamp,
    "svix-signature": svixSignature
  }) as { type: string; data: { id: string } };

  if (event.type === "user.created" || event.type === "user.updated") {
    await syncClerkUser(event.data.id);
  }

  return new Response("ok", { status: 200 });
}
