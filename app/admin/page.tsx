import Link from "next/link";

import { Badge, Card, PageShell } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function AdminPage() {
  const admin = await requireAdmin();
  const [users, pendingEntries, events, rates, notifications, languagePairs] = await Promise.all([
    prisma.user.findMany({
      where: { role: "TRANSLATOR" },
      include: {
        documents: true,
        onboarding: true,
        languagePairs: { include: { languagePair: true } },
        timesheetEntries: {
          orderBy: { date: "desc" },
          take: 1
        }
      },
      orderBy: { createdAt: "desc" }
    }),
    prisma.timesheetEntry.findMany({
      where: { status: "PENDING" },
      include: {
        user: true,
        event: true
      },
      orderBy: { submittedAt: "asc" }
    }),
    prisma.event.findMany({
      orderBy: { startDate: "desc" }
    }),
    prisma.hourlyRate.findMany({
      orderBy: { rateType: "asc" }
    }),
    prisma.notification.findMany({
      where: { userId: admin.id, isRead: false },
      orderBy: { createdAt: "desc" },
      take: 20
    }),
    prisma.languagePair.findMany({
      where: { isActive: true },
      orderBy: { label: "asc" }
    })
  ]);

  const rateMap = new Map(rates.map((r) => [r.rateType, Number(r.amount)]));

  // Compute earnings per translator (admin-only)
  const allApproved = await prisma.timesheetEntry.findMany({
    where: { status: "APPROVED" },
    select: { userId: true, hours: true, rateType: true }
  });
  const earningsMap = new Map<string, { totalHours: number; totalEarnings: number }>();
  for (const entry of allApproved) {
    const current = earningsMap.get(entry.userId) ?? { totalHours: 0, totalEarnings: 0 };
    const hours = Number(entry.hours);
    const rate = rateMap.get(entry.rateType) ?? 0;
    current.totalHours += hours;
    current.totalEarnings += hours * rate;
    earningsMap.set(entry.userId, current);
  }

  return (
    <PageShell
      title={`Admin dashboard for ${admin.email}`}
      description="Manage translators, events, timesheets, rates, and exports."
    >
      {/* Notification inbox */}
      {notifications.length > 0 && (
        <Card>
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-2xl font-semibold">Notifications ({notifications.length})</h2>
            <form action="/api/notifications" method="post">
              <input name="notificationId" type="hidden" value="all" />
              <button className="button secondary" type="submit">Mark all read</button>
            </form>
          </div>
          <ul className="mt-4 space-y-2">
            {notifications.map((n) => (
              <li className="flex items-start justify-between gap-3 rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm" key={n.id}>
                <div>
                  <p className="font-semibold">{n.title}</p>
                  <p className="text-slate-600">{n.message}</p>
                  <p className="mt-1 text-xs text-slate-400">{n.createdAt.toISOString().slice(0, 16).replace("T", " ")}</p>
                </div>
                {n.link && <Link className="button secondary" href={n.link}>View</Link>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Invite + Create user */}
      <div className="grid-auto">
        <Card>
          <h2 className="text-2xl font-semibold">Invite translator</h2>
          <form action="/api/invites" className="mt-4 flex flex-wrap gap-3" method="post">
            <input className="min-w-[280px] rounded-full border border-slate-300 px-4 py-3" name="email" placeholder="translator@example.com" required type="email" />
            <button className="button" type="submit">Send invite</button>
          </form>
        </Card>
        <Card>
          <h2 className="text-2xl font-semibold">Create translator manually</h2>
          <form action="/api/users" className="mt-4 grid gap-3" method="post">
            <div className="grid-auto">
              <input className="rounded-full border border-slate-300 px-4 py-3" name="email" placeholder="Email" required type="email" />
              <input className="rounded-full border border-slate-300 px-4 py-3" name="fullName" placeholder="Full legal name" required />
            </div>
            <button className="button secondary" type="submit">Create account</button>
          </form>
        </Card>
      </div>

      {/* Event management */}
      <Card>
        <h2 className="text-2xl font-semibold">Event management</h2>
        <form action="/api/events" className="mt-4 flex flex-wrap items-end gap-3" method="post">
          <div className="field">
            <label htmlFor="eventName">Event name</label>
            <input id="eventName" name="name" required />
          </div>
          <div className="field">
            <label htmlFor="eventStart">Start date</label>
            <input id="eventStart" name="startDate" required type="date" />
          </div>
          <div className="field">
            <label htmlFor="eventEnd">End date</label>
            <input id="eventEnd" name="endDate" required type="date" />
          </div>
          <div className="field">
            <label htmlFor="eventCity">City</label>
            <input id="eventCity" name="city" required />
          </div>
          <button className="button" type="submit">Create event</button>
        </form>
        <table className="table mt-5">
          <thead>
            <tr>
              <th>Event name</th>
              <th>Dates</th>
              <th>City</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id}>
                <td>{event.name}</td>
                <td>{event.startDate.toISOString().slice(0, 10)} to {event.endDate.toISOString().slice(0, 10)}</td>
                <td>{event.city}</td>
                <td><Badge tone={event.isActive ? "success" : "default"}>{event.isActive ? "Active" : "Inactive"}</Badge></td>
                <td>
                  <form action={`/api/events/${event.id}?deleteEntries=false`} className="inline" method="delete">
                    <button className="button secondary" type="submit">Delete</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Rate configuration */}
      <Card>
        <h2 className="text-2xl font-semibold">Rate configuration</h2>
        <form action="/api/rates" className="mt-4 flex flex-wrap items-end gap-3" method="post">
          <div className="field">
            <label htmlFor="rateType">Rate type</label>
            <select id="rateType" name="rateType">
              <option value="STANDARD">Standard</option>
              <option value="SUNDAY">Sunday</option>
              <option value="OVERTIME">Overtime</option>
              <option value="PUBLIC_HOLIDAY">Public Holiday</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="rateAmount">Hourly rate ($)</label>
            <input id="rateAmount" min="0" name="amount" required step="0.01" type="number" />
          </div>
          <button className="button secondary" type="submit">Save rate</button>
        </form>
        <div className="mt-4 flex flex-wrap gap-3">
          {rates.map((r) => (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm" key={r.id}>
              <span className="font-semibold">{r.rateType.replaceAll("_", " ")}:</span> ${Number(r.amount).toFixed(2)}/hr
            </div>
          ))}
        </div>
      </Card>

      {/* Exports */}
      <div className="grid-auto">
        <Card>
          <h2 className="text-2xl font-semibold">MYOB timesheet export</h2>
          <form action="/api/export" className="mt-4 flex flex-wrap items-end gap-3" method="get">
            <div className="field">
              <label htmlFor="from">From</label>
              <input id="from" name="from" type="date" />
            </div>
            <div className="field">
              <label htmlFor="to">To</label>
              <input id="to" name="to" type="date" />
            </div>
            <button className="button secondary" type="submit">Download MYOB CSV</button>
          </form>
        </Card>
        <Card>
          <h2 className="text-2xl font-semibold">Translator profiles export</h2>
          <Link className="button secondary mt-4 inline-block" href="/api/export/users">Download profiles CSV</Link>
        </Card>
      </div>

      {/* Translator records */}
      <Card>
        <h2 className="text-2xl font-semibold">Translator records</h2>
        <table className="table mt-5">
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>City</th>
              <th>Languages</th>
              <th>Onboarding</th>
              <th>Last entry</th>
              <th>Earnings</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user: (typeof users)[number]) => {
              const earnings = earningsMap.get(user.id);
              return (
                <tr key={user.id}>
                  <td>{user.fullName ?? user.email}</td>
                  <td>
                    <Badge tone={user.status === "ACTIVE" ? "success" : user.status === "SUBMITTED_FOR_REVIEW" ? "warning" : "default"}>
                      {user.status.replaceAll("_", " ")}
                    </Badge>
                  </td>
                  <td>{user.city ?? "-"}</td>
                  <td className="text-xs">{user.languagePairs.map((lp) => lp.languagePair.label).join(", ") || "-"}</td>
                  <td>
                    {user.onboarding?.submittedAt ? "Submitted" : user.onboarding?.currentStep ?? "Not started"}
                    {user.onboarding?.docEmailFallback ? <div className="mt-1 text-sm text-amber-700">Docs declared emailed</div> : null}
                  </td>
                  <td>{user.timesheetEntries[0]?.date.toISOString().slice(0, 10) ?? "None"}</td>
                  <td className="text-xs">
                    {earnings ? `${earnings.totalHours.toFixed(1)}h / $${earnings.totalEarnings.toFixed(2)}` : "-"}
                  </td>
                  <td>
                    <form action="/api/users/status" className="flex flex-wrap gap-2" method="post">
                      <input name="userId" type="hidden" value={user.id} />
                      <button className="button secondary" name="status" type="submit" value="ACTIVE">Activate</button>
                      <button className="button secondary" name="status" type="submit" value="INACTIVE">Deactivate</button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {/* Document review */}
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
                            document.status === "ACCEPTED" ? "success"
                              : document.status === "RESUBMISSION_REQUESTED" ? "danger"
                              : "default"
                          }
                        >
                          {document.status.replaceAll("_", " ")}
                        </Badge>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {document.driveFileId ? (
                          <>
                            <Link className="button secondary" href={`/documents/${document.id}`}>View in app</Link>
                            <Link className="button secondary" href={`/api/documents/access?documentId=${document.id}&mode=view`}>Open in Drive</Link>
                          </>
                        ) : null}
                        <form action="/api/documents/review" className="flex flex-wrap gap-2" method="post">
                          <input name="documentId" type="hidden" value={document.id} />
                          <button className="button secondary" name="action" type="submit" value="accept">Accept</button>
                          <input className="rounded-full border border-slate-300 px-4 py-2" name="comment" placeholder="Reason for resubmission" />
                          <button className="button secondary" name="action" type="submit" value="resubmit">Request resubmission</button>
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

      {/* Pending timesheet entries */}
      <Card>
        <h2 className="text-2xl font-semibold">Pending timesheet entries</h2>
        <div className="mt-5 space-y-4">
          {pendingEntries.map((entry: (typeof pendingEntries)[number]) => (
            <div className="rounded-2xl border border-slate-200 p-4" key={entry.id}>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <strong>{entry.user.fullName ?? entry.user.email}</strong>
                  <p className="mt-1 text-sm text-slate-600">
                    {entry.event.name} &middot; {entry.date.toISOString().slice(0, 10)} &middot; {entry.startTime} - {entry.endTime} &middot; {Number(entry.hours).toFixed(2)}h &middot; {entry.rateType.replaceAll("_", " ")}
                  </p>
                  {entry.comment && <p className="mt-1 text-sm text-slate-500">Note: {entry.comment}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <form action="/api/timesheets/review" method="post">
                    <input name="entryId" type="hidden" value={entry.id} />
                    <input name="action" type="hidden" value="approve" />
                    <button className="button" type="submit">Approve</button>
                  </form>
                  <form action="/api/timesheets/review" className="flex flex-wrap gap-2" method="post">
                    <input name="entryId" type="hidden" value={entry.id} />
                    <input name="action" type="hidden" value="reject" />
                    <input className="rounded-full border border-slate-300 px-4 py-2" name="comment" placeholder="Reason required" required />
                    <button className="button secondary" type="submit">Reject</button>
                  </form>
                </div>
              </div>
            </div>
          ))}
          {pendingEntries.length === 0 && <p className="text-sm text-slate-500">No pending entries.</p>}
        </div>
      </Card>
    </PageShell>
  );
}
