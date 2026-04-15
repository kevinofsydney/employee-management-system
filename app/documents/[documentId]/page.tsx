import Link from "next/link";

import { Badge, Card, PageShell } from "@/components/ui";
import { requireAppUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function DocumentViewerPage({
  params
}: {
  params: Promise<{ documentId: string }>;
}) {
  const user = await requireAppUser();
  const { documentId } = await params;

  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: { user: true }
  });

  if (!document) {
    return (
      <PageShell title="Document not found" description="This file could not be located.">
        <Card>
          <p className="card-description">The requested document does not exist.</p>
        </Card>
      </PageShell>
    );
  }

  const canAccess = user.role === "ADMIN" || document.userId === user.id;
  if (!canAccess) {
    return (
      <PageShell title="Access denied" description="You are not allowed to view this document.">
        <Card>
          <p className="card-description">Authorization failed for this document.</p>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell
      title={document.fileName ?? document.type.replaceAll("_", " ")}
      description="This viewer keeps authorization in the app while rendering the Google Drive-backed document."
    >
      <div className="flex-start" style={{ flexWrap: "wrap" }}>
        <Badge tone={document.status === "ACCEPTED" ? "success" : document.status === "RESUBMISSION_REQUESTED" ? "danger" : "default"}>
          {document.status.replaceAll("_", " ")}
        </Badge>
        <Link className="button secondary" href={`/api/documents/access?documentId=${document.id}&mode=download`}>
          Download file
        </Link>
        <Link className="button secondary" href={`/api/documents/access?documentId=${document.id}&mode=view`}>
          Open in Drive
        </Link>
      </div>
      <Card style={{ overflow: "hidden", padding: 0 }}>
        <iframe
          src={`/api/documents/access?documentId=${document.id}&mode=view`}
          style={{ border: 0, minHeight: "70vh", width: "100%" }}
          title={document.fileName ?? document.type}
        />
      </Card>
      {document.adminComment ? (
        <Card>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Admin comment</h2>
          <p style={{ marginTop: "0.75rem", color: "var(--danger-color)" }}>{document.adminComment}</p>
        </Card>
      ) : null}
    </PageShell>
  );
}
