import Link from "next/link";

import { Card, PageShell } from "@/components/ui";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  return (
    <PageShell
      title="Complete your Courant onboarding invite"
      description="Your invite token is validated on sign-in, and your app account is matched to the invited email before onboarding access is granted."
    >
      <Card>
        <p className="card-description">
          Invite token: <code>{token}</code>
        </p>
        <p className="card-description" style={{ marginTop: "1rem" }}>
          If you do not already have access, sign in with the invited email address. The system will activate your onboarding record after invite redemption.
        </p>
        <div className="flex-start mt-4">
          <Link className="button" href={`/sign-in?redirect_url=/api/invites/redeem?token=${token}`}>
            Continue with magic link
          </Link>
        </div>
      </Card>
    </PageShell>
  );
}
