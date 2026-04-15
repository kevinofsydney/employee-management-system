import Link from "next/link";
import { SignedIn, SignedOut } from "@clerk/nextjs";

import { Card, PageShell } from "@/components/ui";

export default function HomePage() {
  return (
    <PageShell
      title="Translator onboarding and timesheets, with real controls around sensitive documents."
      description="Courant's app uses passwordless sign-in, explicit admin activation, and Google Drive-backed document handling without exposing raw sharing links to translators."
    >
      <div className="grid-auto">
        <Card>
          <h2 className="card-title">Translator flow</h2>
          <p className="card-description" style={{ marginTop: "0.75rem" }}>
            Complete onboarding, upload AU payroll documents, sign agreements, and submit weekly timesheets once activated.
          </p>
        </Card>
        <Card>
          <h2 className="card-title">Admin controls</h2>
          <p className="card-description" style={{ marginTop: "0.75rem" }}>
            Invite translators, review documents, approve timesheets, export payroll CSVs, and audit every sensitive action.
          </p>
        </Card>
      </div>
      <div className="flex-start" style={{ flexWrap: "wrap" }}>
        <SignedOut>
          <Link className="button" href="/sign-in">
            Sign in
          </Link>
        </SignedOut>
        <SignedIn>
          <Link className="button" href="/dashboard">
            Open dashboard
          </Link>
        </SignedIn>
        <Link className="button secondary" href="/invite/demo">
          Review invite flow
        </Link>
      </div>
    </PageShell>
  );
}
