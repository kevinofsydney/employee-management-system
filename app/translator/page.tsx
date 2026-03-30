import { Badge, Card, PageShell } from "@/components/ui";
import { TimesheetForm } from "@/components/timesheet-form";
import { requireAppUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { documentLabels, requiredDocumentTypes } from "@/lib/documents";
import { getPayPeriodRange } from "@/lib/periods";

export default async function TranslatorPage() {
  const user = await requireAppUser();
  const [documents, timesheets, projects, languagePairs] = await Promise.all([
    prisma.document.findMany({
      where: { userId: user.id },
      orderBy: { type: "asc" }
    }),
    prisma.timesheet.findMany({
      where: { userId: user.id },
      include: {
        lineItems: {
          include: {
            project: true,
            languagePair: true
          }
        }
      },
      orderBy: { periodStart: "desc" }
    }),
    prisma.project.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" }
    }),
    prisma.languagePair.findMany({
      where: { isActive: true },
      orderBy: { label: "asc" }
    })
  ]);

  const configuredLanguagePairs = user.languagePairs.map((entry: (typeof user.languagePairs)[number]) => entry.languagePair);
  const currentPeriod = getPayPeriodRange(new Date());
  const editableTimesheet = timesheets.find(
    (timesheet: (typeof timesheets)[number]) =>
      timesheet.periodStart.toISOString() === currentPeriod.start.toISOString() &&
      timesheet.periodEnd.toISOString() === currentPeriod.end.toISOString() &&
      ["DRAFT", "REJECTED"].includes(timesheet.status)
  );
  const documentMap = new Map<(typeof documents)[number]["type"], (typeof documents)[number]>(
    documents.map((document: (typeof documents)[number]) => [document.type, document])
  );

  return (
    <PageShell
      title={`Welcome, ${user.preferredName ?? user.fullName ?? user.email}`}
      description="Complete each onboarding requirement, then submit weekly timesheets once Kevin or David activates your account."
    >
      <div className="grid-auto">
        <Card>
          <h2 className="text-xl font-semibold">Account status</h2>
          <p className="mt-3 text-sm text-slate-600">Your role is locked to your Courant translator record.</p>
          <div className="mt-4">
            <Badge tone={user.status === "ACTIVE" ? "success" : "warning"}>{user.status.replaceAll("_", " ")}</Badge>
          </div>
        </Card>
        <Card>
          <h2 className="text-xl font-semibold">Current pay period</h2>
          <p className="mt-3 text-sm text-slate-600">
            {currentPeriod.start.toISOString().slice(0, 10)} to {currentPeriod.end.toISOString().slice(0, 10)}
          </p>
        </Card>
      </div>

      <Card>
        <h2 className="text-2xl font-semibold">Profile details</h2>
        <form action="/api/onboarding/profile" className="mt-5 grid gap-4" method="post">
          <div className="grid-auto">
            <div className="field">
              <label htmlFor="fullName">Full legal name</label>
              <input defaultValue={user.fullName ?? ""} id="fullName" name="fullName" required />
            </div>
            <div className="field">
              <label htmlFor="preferredName">Preferred name</label>
              <input defaultValue={user.preferredName ?? ""} id="preferredName" name="preferredName" required />
            </div>
            <div className="field">
              <label htmlFor="phone">Phone</label>
              <input defaultValue={user.phone ?? ""} id="phone" name="phone" required />
            </div>
            <div className="field">
              <label htmlFor="yearsOfExperience">Years of experience</label>
              <input defaultValue={user.yearsOfExperience ?? 0} id="yearsOfExperience" min="0" name="yearsOfExperience" required type="number" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="mailingAddress">Mailing address</label>
            <textarea defaultValue={user.mailingAddress ?? ""} id="mailingAddress" name="mailingAddress" required rows={4} />
          </div>
          <div className="field">
            <label htmlFor="certifications">Certifications</label>
            <textarea defaultValue={user.certifications ?? ""} id="certifications" name="certifications" rows={3} />
          </div>
          <div className="field">
            <label>Language pairs</label>
            <div className="grid-auto">
              {languagePairs.map((languagePair: (typeof languagePairs)[number]) => (
                <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" key={languagePair.id}>
                  <input
                    defaultChecked={configuredLanguagePairs.some((entry: (typeof configuredLanguagePairs)[number]) => entry.id === languagePair.id)}
                    name="languagePairIds"
                    type="checkbox"
                    value={languagePair.id}
                  />
                  {languagePair.label}
                </label>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input defaultChecked={Boolean(user.privacyAcceptedAt)} name="privacyAccepted" type="checkbox" />
            I have read the privacy notice and consent to secure handling of my onboarding data.
          </label>
          <button className="button secondary" type="submit">
            Save profile step
          </button>
        </form>
      </Card>

      <Card>
        <h2 className="text-2xl font-semibold">Onboarding checklist</h2>
        <div className="mt-5 grid-auto">
          {requiredDocumentTypes.map((type) => {
            const document = documentMap.get(type);
            return (
              <form
                action="/api/documents"
                className="rounded-2xl border border-slate-200 p-4"
                encType="multipart/form-data"
                key={type}
                method="post"
              >
                <input name="type" type="hidden" value={type} />
                <div className="flex items-center justify-between gap-3">
                  <strong>{documentLabels[type]}</strong>
                  <Badge tone={document?.status === "ACCEPTED" ? "success" : document?.status === "UPLOADED" ? "default" : "warning"}>
                    {document?.status?.replaceAll("_", " ") ?? "pending"}
                  </Badge>
                </div>
                {document?.adminComment ? (
                  <p className="mt-3 text-sm text-rose-700">Admin note: {document.adminComment}</p>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-3">
                  <input accept=".pdf,.png,.jpg,.jpeg" name="file" required type="file" />
                  <button className="button secondary" type="submit">
                    Upload
                  </button>
                </div>
              </form>
            );
          })}
        </div>
        <form action="/api/onboarding/agreements" className="mt-6 grid gap-4" method="post">
          <div className="field">
            <label htmlFor="signatureName">Signature name</label>
            <input defaultValue={user.fullName ?? ""} id="signatureName" name="signatureName" required />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input name="consentGiven" required type="checkbox" /> I agree to the contractor agreement and confidentiality terms.
          </label>
          <button className="button secondary" type="submit">
            Save agreement step
          </button>
        </form>
        <form action="/api/onboarding/submit" className="mt-4" method="post">
          <button className="button" type="submit">
            Submit onboarding for review
          </button>
        </form>
      </Card>

      <Card>
        <h2 className="text-2xl font-semibold">Submit timesheet</h2>
        {editableTimesheet?.adminComment ? (
          <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            Admin note on your last revision: {editableTimesheet.adminComment}
          </p>
        ) : null}
        <TimesheetForm
          action="/api/timesheets"
          disabled={user.status !== "ACTIVE"}
          initialItems={
            editableTimesheet?.lineItems.map((item: (typeof editableTimesheet.lineItems)[number]) => ({
              projectId: item.projectId,
              languagePairId: item.languagePairId,
              hours: Number(item.hours).toString(),
              note: item.note ?? ""
            })) ?? []
          }
          languagePairs={configuredLanguagePairs.map((languagePair: (typeof configuredLanguagePairs)[number]) => ({
            id: languagePair.id,
            label: languagePair.label
          }))}
          periodEnd={currentPeriod.end.toISOString()}
          periodStart={currentPeriod.start.toISOString()}
          projects={projects.map((project: (typeof projects)[number]) => ({
            id: project.id,
            label: project.name
          }))}
        />
      </Card>

      <Card>
        <h2 className="text-2xl font-semibold">Timesheet history</h2>
        <table className="table mt-5">
          <thead>
            <tr>
              <th>Period</th>
              <th>Status</th>
              <th>Total hours</th>
            </tr>
          </thead>
          <tbody>
            {timesheets.map((timesheet: (typeof timesheets)[number]) => {
              const totalHours = timesheet.lineItems.reduce(
                (sum: number, item: (typeof timesheet.lineItems)[number]) => sum + Number(item.hours),
                0
              );
              return (
                <tr key={timesheet.id}>
                  <td>
                    {timesheet.periodStart.toISOString().slice(0, 10)} to {timesheet.periodEnd.toISOString().slice(0, 10)}
                  </td>
                  <td>
                    {timesheet.status}
                    {timesheet.adminComment ? <div className="mt-1 text-sm text-rose-700">{timesheet.adminComment}</div> : null}
                  </td>
                  <td>{totalHours.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </PageShell>
  );
}
