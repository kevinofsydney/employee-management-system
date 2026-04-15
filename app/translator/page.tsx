import Link from "next/link";

import { Badge, Card, PageShell } from "@/components/ui";
import { ProgressBar } from "@/components/progress-bar";
import { TimesheetForm } from "@/components/timesheet-form";
import { requireAppUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { documentLabels, requiredDocumentTypes } from "@/lib/documents";

export default async function TranslatorPage() {
  const user = await requireAppUser();
  const [documents, entries, events, languagePairs] = await Promise.all([
    prisma.document.findMany({
      where: { userId: user.id },
      orderBy: { type: "asc" }
    }),
    prisma.timesheetEntry.findMany({
      where: { userId: user.id },
      include: { event: true },
      orderBy: { date: "desc" }
    }),
    prisma.event.findMany({
      where: { isActive: true },
      orderBy: { startDate: "desc" }
    }),
    prisma.languagePair.findMany({
      where: { isActive: true },
      orderBy: { label: "asc" }
    })
  ]);

  const configuredLanguagePairs = user.languagePairs.map((entry: (typeof user.languagePairs)[number]) => entry.languagePair);
  const onboarding = user.onboarding;
  const documentMap = new Map<(typeof documents)[number]["type"], (typeof documents)[number]>(
    documents.map((document: (typeof documents)[number]) => [document.type, document])
  );

  const profileDone = Boolean(onboarding?.profileCompletedAt);
  const docsDone = Boolean(onboarding?.documentsCompletedAt);
  const agreementsDone = Boolean(onboarding?.agreementsCompletedAt);
  const submitted = Boolean(onboarding?.submittedAt);

  const progressSteps = [
    { label: "Profile", status: profileDone ? "complete" as const : onboarding?.currentStep === "PROFILE" ? "in_progress" as const : "not_started" as const },
    { label: "Documents", status: docsDone ? "complete" as const : onboarding?.currentStep === "DOCUMENTS" ? "in_progress" as const : "not_started" as const },
    { label: "Agreements", status: agreementsDone ? "complete" as const : onboarding?.currentStep === "AGREEMENTS" ? "in_progress" as const : "not_started" as const },
    { label: "Confirmation", status: submitted ? "complete" as const : onboarding?.currentStep === "CONFIRMATION" ? "in_progress" as const : "not_started" as const }
  ];

  const eventOptions = events.map((e) => ({
    id: e.id,
    name: e.name,
    startDate: e.startDate.toISOString().slice(0, 10),
    endDate: e.endDate.toISOString().slice(0, 10),
    city: e.city
  }));

  return (
    <PageShell
      title={`Welcome, ${user.preferredName ?? user.fullName ?? user.email}`}
      description="Complete each onboarding requirement, then submit timesheet entries once Kevin or David activates your account."
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
          <h2 className="text-xl font-semibold">Onboarding progress</h2>
          <div className="mt-4">
            <ProgressBar steps={progressSteps} />
          </div>
        </Card>
      </div>

      <Card>
        <h2 className="text-2xl font-semibold">Step 1: Profile details</h2>
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
              <label htmlFor="city">City</label>
              <input defaultValue={user.city ?? ""} id="city" name="city" required />
            </div>
          </div>
          <div className="grid-auto">
            <div className="field">
              <label htmlFor="tfn">Tax File Number (9 digits)</label>
              <input defaultValue={user.tfn ?? ""} id="tfn" maxLength={9} name="tfn" pattern="\d{9}" required title="TFN must be exactly 9 digits" />
            </div>
            <div className="field">
              <label htmlFor="bsb">BSB (6 digits)</label>
              <input defaultValue={user.bsb ?? ""} id="bsb" maxLength={6} name="bsb" pattern="\d{6}" required title="BSB must be exactly 6 digits" />
            </div>
            <div className="field">
              <label htmlFor="yearsOfExperience">Years of experience</label>
              <input defaultValue={user.yearsOfExperience ?? 0} id="yearsOfExperience" min="0" name="yearsOfExperience" required type="number" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="mailingAddress">Mailing address</label>
            <textarea defaultValue={user.mailingAddress ?? ""} id="mailingAddress" name="mailingAddress" required rows={3} />
          </div>
          <div className="field">
            <label htmlFor="certifications">Certifications</label>
            <textarea defaultValue={user.certifications ?? ""} id="certifications" name="certifications" rows={2} />
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
        <h2 className="text-2xl font-semibold">Step 2: Document uploads</h2>
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
                  <input accept=".pdf,.png,.jpg,.jpeg,.docx" name="file" required type="file" />
                  <button className="button secondary" type="submit">
                    Upload
                  </button>
                  {document?.driveFileId ? (
                    <Link className="button secondary" href={`/documents/${document.id}`}>
                      View in app
                    </Link>
                  ) : null}
                </div>
              </form>
            );
          })}
        </div>
        <Card className="mt-6 border-dashed bg-amber-50">
          <h3 className="text-lg font-semibold">Drive fallback</h3>
          <p className="mt-2 text-sm text-slate-700">
            If Google Drive upload is temporarily unavailable, declare that you emailed the required documents to Kevin or David so onboarding can still proceed for review.
          </p>
          <form action="/api/documents/fallback" className="mt-4 flex flex-wrap items-center gap-3" method="post">
            <input name="declared" type="hidden" value={onboarding?.docEmailFallback ? "false" : "true"} />
            <button className="button secondary" type="submit">
              {onboarding?.docEmailFallback ? "Clear emailed-documents declaration" : "Declare documents emailed"}
            </button>
            {onboarding?.docEmailFallback ? <Badge tone="warning">Documents declared emailed</Badge> : null}
          </form>
        </Card>
      </Card>

      <Card>
        <h2 className="text-2xl font-semibold">Step 3: Consent & declarations</h2>
        <form action="/api/onboarding/agreements" className="mt-5 grid gap-4" method="post">
          <div className="field">
            <label htmlFor="signatureName">Signature (type your full legal name)</label>
            <input defaultValue={user.fullName ?? ""} id="signatureName" name="signatureName" required />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input name="consentGiven" required type="checkbox" /> I agree to the contractor agreement and confidentiality terms.
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input required type="checkbox" /> I confirm all information provided is accurate and complete.
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

      {user.status === "ACTIVE" && (
        <>
          <Card>
            <h2 className="text-2xl font-semibold">Submit timesheet entry</h2>
            <TimesheetForm
              action="/api/timesheets"
              disabled={user.status !== "ACTIVE"}
              events={eventOptions}
            />
          </Card>

          <Card>
            <h2 className="text-2xl font-semibold">Timesheet history</h2>
            <table className="table mt-5">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Hours</th>
                  <th>Rate type</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry: (typeof entries)[number]) => (
                  <tr key={entry.id}>
                    <td>{entry.event.name}</td>
                    <td>{entry.date.toISOString().slice(0, 10)}</td>
                    <td>{entry.startTime} - {entry.endTime}</td>
                    <td>{Number(entry.hours).toFixed(2)}</td>
                    <td>{entry.rateType.replaceAll("_", " ")}</td>
                    <td>
                      <Badge tone={entry.status === "APPROVED" ? "success" : entry.status === "REJECTED" ? "danger" : "default"}>
                        {entry.status}
                      </Badge>
                      {entry.adminComment ? <div className="mt-1 text-sm text-rose-700">{entry.adminComment}</div> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </PageShell>
  );
}
