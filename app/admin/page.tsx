import Link from "next/link";

import { Badge, Card, PageShell } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { getPayPeriodStartDay } from "@/lib/config";
import { prisma } from "@/lib/db";

export default async function AdminPage() {
  const admin = await requireAdmin();
  const payPeriodStartDay = await getPayPeriodStartDay();
  const [users, pendingTimesheets] = await Promise.all([
    prisma.user.findMany({
      where: { role: "TRANSLATOR" },
      include: {
        documents: true,
        onboarding: true,
        timesheets: {
          orderBy: { periodStart: "desc" },
          take: 1
        }
      },
      orderBy: { createdAt: "desc" }
    }),
    prisma.timesheet.findMany({
      where: { status: "SUBMITTED" },
      include: {
        user: true,
        lineItems: {
          include: {
            project: true,
            languagePair: true
          }
        }
      },
      orderBy: { submittedAt: "asc" }
    })
  ]);

  return (
    <PageShell
      title={`Admin dashboard for ${admin.email}`}
      description="Invite translators, review onboarding records, activate accounts, and handle weekly approvals with audit coverage."
    >
      <Card>
        <h2 className="text-2xl font-semibold">Invite translator</h2>
        <form action="/api/invites" className="mt-4 flex flex-wrap gap-3" method="post">
          <input className="min-w-[280px] rounded-full border border-slate-300 px-4 py-3" name="email" placeholder="translator@example.com" required type="email" />
          <button className="button" type="submit">
            Send invite
          </button>
        </form>
      </Card>

      <div className="grid-auto">
        <Card>
          <h2 className="text-2xl font-semibold">Pay period settings</h2>
          <form action="/api/config/pay-period" className="mt-4 flex flex-wrap items-end gap-3" method="post">
            <div className="field">
              <label htmlFor="startDay">Weekly start day</label>
              <select defaultValue={String(payPeriodStartDay)} id="startDay" name="startDay">
                <option value="0">Sunday</option>
                <option value="1">Monday</option>
                <option value="2">Tuesday</option>
                <option value="3">Wednesday</option>
                <option value="4">Thursday</option>
                <option value="5">Friday</option>
                <option value="6">Saturday</option>
              </select>
            </div>
            <button className="button secondary" type="submit">
              Save setting
            </button>
          </form>
        </Card>

        <Card>
          <h2 className="text-2xl font-semibold">Export approved CSV</h2>
          <form action="/api/export" className="mt-4 flex flex-wrap items-end gap-3" method="get">
            <div className="field">
              <label htmlFor="from">From</label>
              <input id="from" name="from" type="date" />
            </div>
            <div className="field">
              <label htmlFor="to">To</label>
              <input id="to" name="to" type="date" />
            </div>
            <button className="button secondary" type="submit">
              Download CSV
            </button>
          </form>
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-semibold">Translator records</h2>
          <Link className="button secondary" href="/api/export?format=csv">
            Export approved CSV
          </Link>
        </div>
        <table className="table mt-5">
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Onboarding</th>
              <th>Last timesheet</th>
              <th>Documents</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user: (typeof users)[number]) => (
              <tr key={user.id}>
                <td>{user.fullName ?? user.email}</td>
                <td>
                  <Badge tone={user.status === "ACTIVE" ? "success" : user.status === "SUBMITTED_FOR_REVIEW" ? "warning" : "default"}>
                    {user.status.replaceAll("_", " ")}
                  </Badge>
                </td>
                <td>
                  {user.onboarding?.submittedAt ? "Submitted" : user.onboarding?.currentStep ?? "Not started"}
                  {user.onboarding?.docEmailFallback ? <div className="mt-1 text-sm text-amber-700">Docs declared emailed</div> : null}
                </td>
                <td>{user.timesheets[0]?.periodEnd.toISOString().slice(0, 10) ?? "None yet"}</td>
                <td>{user.documents.filter((doc: (typeof user.documents)[number]) => doc.status === "UPLOADED" || doc.status === "ACCEPTED").length}</td>
                <td>
                  <form action="/api/users/status" className="flex flex-wrap gap-2" method="post">
                    <input name="userId" type="hidden" value={user.id} />
                    <button className="button secondary" name="status" type="submit" value="ACTIVE">
                      Activate
                    </button>
                    <button className="button secondary" name="status" type="submit" value="INACTIVE">
                      Deactivate
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <h2 className="text-2xl font-semibold">Document review</h2>
        <div className="mt-5 space-y-4">
          {users
            .filter((user) => user.documents.length > 0)
            .map((user: (typeof users)[number]) => (
              <div className="rounded-2xl border border-slate-200 p-4" key={`documents-${user.id}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <strong>{user.fullName ?? user.email}</strong>
                  <Badge tone={user.status === "ACTIVE" ? "success" : "default"}>{user.status.replaceAll("_", " ")}</Badge>
                </div>
                <div className="mt-4 space-y-3">
                  {user.documents.map((document: (typeof user.documents)[number]) => (
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4" key={document.id}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold">{document.type.replaceAll("_", " ")}</p>
                          <p className="text-sm text-slate-600">{document.fileName ?? "No uploaded file yet"}</p>
                        </div>
                        <Badge
                          tone={
                            document.status === "ACCEPTED"
                              ? "success"
                              : document.status === "RESUBMISSION_REQUESTED"
                                ? "danger"
                                : "default"
                          }
                        >
                          {document.status.replaceAll("_", " ")}
                        </Badge>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {document.driveFileId ? (
                          <>
                            <Link className="button secondary" href={`/documents/${document.id}`}>
                              View in app
                            </Link>
                            <Link className="button secondary" href={`/api/documents/access?documentId=${document.id}&mode=view`}>
                              Open in Drive
                            </Link>
                          </>
                        ) : null}
                        <form action="/api/documents/review" className="flex flex-wrap gap-2" method="post">
                          <input name="documentId" type="hidden" value={document.id} />
                          <button className="button secondary" name="action" type="submit" value="accept">
                            Accept
                          </button>
                          <input className="rounded-full border border-slate-300 px-4 py-2" name="comment" placeholder="Reason for resubmission" />
                          <button className="button secondary" name="action" type="submit" value="resubmit">
                            Request resubmission
                          </button>
                        </form>
                      </div>
                      {document.adminComment ? <p className="mt-3 text-sm text-rose-700">Comment: {document.adminComment}</p> : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      </Card>

      <Card>
        <h2 className="text-2xl font-semibold">Pending timesheets</h2>
        <div className="mt-5 space-y-4">
          {pendingTimesheets.map((timesheet: (typeof pendingTimesheets)[number]) => (
            <div className="rounded-2xl border border-slate-200 p-4" key={timesheet.id}>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <strong>{timesheet.user.fullName ?? timesheet.user.email}</strong>
                  <p className="mt-1 text-sm text-slate-600">
                    {timesheet.periodStart.toISOString().slice(0, 10)} to {timesheet.periodEnd.toISOString().slice(0, 10)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <form action="/api/timesheets/review" method="post">
                    <input name="timesheetId" type="hidden" value={timesheet.id} />
                    <input name="action" type="hidden" value="approve" />
                    <button className="button" type="submit">
                      Approve
                    </button>
                  </form>
                  <form action="/api/timesheets/review" className="flex flex-wrap gap-2" method="post">
                    <input name="timesheetId" type="hidden" value={timesheet.id} />
                    <input name="action" type="hidden" value="reject" />
                    <input className="rounded-full border border-slate-300 px-4 py-2" name="comment" placeholder="Reason required" required />
                    <button className="button secondary" type="submit">
                      Reject
                    </button>
                  </form>
                </div>
              </div>
              <ul className="mt-4 space-y-2 text-sm text-slate-700">
                {timesheet.lineItems.map((item: (typeof timesheet.lineItems)[number]) => (
                  <li key={item.id}>
                    {item.project.name} | {item.languagePair.label} | {Number(item.hours).toFixed(2)}h {item.note ? `| ${item.note}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>
    </PageShell>
  );
}
