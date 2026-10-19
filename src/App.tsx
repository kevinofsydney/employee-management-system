import { SignIn, SignUp, useAuth, useClerk } from "@clerk/react";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { api, download } from "./api";
import { dateTime, displayName, fullName, hours, localInput, money, shiftTime } from "./format";
import type { Expense, Overview, Shift, User } from "./types";

type Caller = <T>(path: string, options?: RequestInit) => Promise<T>;
type ExpenseDraft = { incurredOn: string; description: string; amount: string; receiptSent: boolean };

function Button({ children, secondary, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { secondary?: boolean }) {
  return <button className={secondary ? "button secondary" : "button"} {...props}>{children}</button>;
}

function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "error" | "success" }) {
  return <div className={`notice ${tone}`} role={tone === "error" ? "alert" : "status"}>{children}</div>;
}

function Status({ value }: { value: string }) {
  return <span className={`status ${value.toLowerCase()}`}>{value.toLowerCase().replaceAll("_", " ")}</span>;
}

function AuthView() {
  const [signup, setSignup] = useState(false);
  return <main className="auth-shell"><div className="auth-intro"><span className="eyebrow">COURANT · TRANSLATORS</span><h1>Your roster, without the paperwork.</h1><p>See your shifts, submit hours and expenses, and keep everything in one place.</p></div>
    <div className="auth-card"><div className="auth-tabs"><button className={!signup ? "selected" : ""} onClick={() => setSignup(false)}>Sign in</button><button className={signup ? "selected" : ""} onClick={() => setSignup(true)}>Create account</button></div>{signup ? <SignUp routing="hash" /> : <SignIn routing="hash" />}</div></main>;
}

function ProfileForm({ user, call, onSaved }: { user: User; call: Caller; onSaved: () => Promise<void> }) {
  const [first, setFirst] = useState(user.legal_first_name);
  const [surname, setSurname] = useState(user.surname);
  const [nickname, setNickname] = useState(user.nickname);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try { await call("/api/me", { method: "PATCH", body: JSON.stringify({ legalFirstName: first, surname, nickname }) }); await onSaved(); }
    catch (cause) { setError((cause as Error).message); }
    finally { setSaving(false); }
  }
  return <form className="card form-stack" onSubmit={submit}><div><h2>Your name</h2><p className="muted">Use the name your admin will recognise in MYOB.</p></div>
    <div className="form-grid"><label>Legal first name<input value={first} maxLength={20} onChange={(e) => setFirst(e.target.value)} required /></label><label>Surname<input value={surname} maxLength={30} onChange={(e) => setSurname(e.target.value)} required /></label></div>
    <label>Nickname <span className="muted">(optional)</span><input value={nickname} maxLength={80} onChange={(e) => setNickname(e.target.value)} /></label>
    {error && <Notice tone="error">{error}</Notice>}<Button disabled={saving}>{saving ? "Saving…" : "Save name"}</Button></form>;
}

function TimesheetEditor({ shift, onSave, onCancel, admin = false }: {
  shift: Shift; onSave: (data: object) => Promise<void>; onCancel: () => void; admin?: boolean;
}) {
  const current = shift.timesheet;
  const [startLocal, setStart] = useState(localInput(current?.start_at ?? shift.start_at));
  const [endLocal, setEnd] = useState(localInput(current?.end_at ?? shift.end_at));
  const [items, setItems] = useState<ExpenseDraft[]>(current?.expenses.map((item) => ({ incurredOn: item.incurred_on, description: item.description, amount: (item.amount_cents / 100).toFixed(2), receiptSent: Boolean(item.receipt_sent) })) ?? []);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const updateItem = (index: number, patch: Partial<ExpenseDraft>) => setItems((old) => old.map((item, i) => i === index ? { ...item, ...patch } : item));
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setSaving(true);
    try {
      await onSave({ shiftId: shift.id, startLocal, endLocal, expenses: items.map((item) => ({ incurredOn: item.incurredOn, description: item.description, amountCents: Math.round(Number(item.amount) * 100), receiptSent: item.receiptSent })) });
    } catch (cause) { setError((cause as Error).message); }
    finally { setSaving(false); }
  }
  return <form className="editor form-stack" onSubmit={submit}>
    <div className="editor-heading"><div><h3>{admin ? "Correct timesheet" : current ? "Edit timesheet" : "Enter timesheet"}</h3><p className="muted">Rostered: {shiftTime(shift.start_at, shift.end_at)} · Sydney time</p></div></div>
    <div className="form-grid"><label>Actual start<input type="datetime-local" step="900" value={startLocal} onChange={(e) => setStart(e.target.value)} required /></label><label>Actual end<input type="datetime-local" step="900" value={endLocal} onChange={(e) => setEnd(e.target.value)} required /></label></div>
    <p className="helper">All breaks are paid. Times are entered in 15-minute steps. Sunday hours are calculated automatically.</p>
    <div className="section-head"><h4>Expenses</h4><Button type="button" secondary onClick={() => setItems((old) => [...old, { incurredOn: startLocal.slice(0, 10), description: "", amount: "", receiptSent: false }])}>+ Add expense</Button></div>
    {items.length === 0 && <p className="muted">No expenses for this shift.</p>}
    {items.map((item, index) => <div className="expense-row" key={index}>
      <div className="form-grid"><label>Date<input type="date" value={item.incurredOn} onChange={(e) => updateItem(index, { incurredOn: e.target.value })} required /></label><label>Amount (AUD)<input type="number" min="0.01" max="100000" step="0.01" value={item.amount} onChange={(e) => updateItem(index, { amount: e.target.value })} required /></label></div>
      <label>Short description<input value={item.description} maxLength={160} onChange={(e) => updateItem(index, { description: e.target.value })} placeholder="e.g. taxi to venue" required /></label>
      <div className="expense-foot"><label className="check"><input type="checkbox" checked={item.receiptSent} onChange={(e) => updateItem(index, { receiptSent: e.target.checked })} /> I have sent this receipt to David or an admin</label><button className="text-button" type="button" onClick={() => setItems((old) => old.filter((_, i) => i !== index))}>Remove</button></div>
    </div>)}
    {error && <Notice tone="error">{error}</Notice>}
    <div className="actions"><Button disabled={saving}>{saving ? "Saving…" : admin ? "Save correction" : "Submit timesheet"}</Button><Button type="button" secondary onClick={onCancel}>Cancel</Button></div>
  </form>;
}

export function TranslatorDashboard({ call }: { call: Caller }) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { setLoading(true); try { const data = await call<{ shifts: Shift[] }>("/api/my/shifts"); setShifts(data.shifts); setError(""); } catch (cause) { setError((cause as Error).message); } finally { setLoading(false); } }, [call]);
  useEffect(() => { void load(); }, [load]);
  async function save(data: object) { await call("/api/my/timesheets", { method: "POST", body: JSON.stringify(data) }); setEditing(null); await load(); }
  const upcoming = shifts.filter((shift) => !shift.timesheet && new Date(shift.end_at) >= new Date()).sort((a, b) => a.start_at.localeCompare(b.start_at));
  const past = shifts.filter((shift) => shift.timesheet || new Date(shift.end_at) < new Date());
  return <div className="page-stack"><div className="page-title"><div><span className="eyebrow">YOUR WORK</span><h1>Roster & timesheets</h1><p>Check your shifts and enter your actual hours when you finish.</p></div></div>
    {error && <Notice tone="error">{error}</Notice>}{loading && <p>Loading shifts…</p>}
    <section><div className="section-head"><h2>Upcoming shifts</h2><span className="count">{upcoming.length}</span></div>{upcoming.length === 0 && !loading && <div className="empty">No upcoming shifts yet. Your admin will add them here.</div>}
      <div className="card-list">{upcoming.map((shift) => <ShiftCard key={shift.id} shift={shift} editing={editing === shift.id} onEdit={() => setEditing(shift.id)} onCancel={() => setEditing(null)} onSave={save} />)}</div></section>
    <section><div className="section-head"><h2>Past & submitted</h2><span className="count">{past.length}</span></div>{past.length === 0 && !loading && <div className="empty">Completed shifts will appear here.</div>}
      <div className="card-list">{past.map((shift) => <ShiftCard key={shift.id} shift={shift} editing={editing === shift.id} onEdit={() => setEditing(shift.id)} onCancel={() => setEditing(null)} onSave={save} />)}</div></section>
  </div>;
}

function ShiftCard({ shift, editing, onEdit, onCancel, onSave }: { shift: Shift; editing: boolean; onEdit: () => void; onCancel: () => void; onSave: (data: object) => Promise<void> }) {
  const sheet = shift.timesheet;
  return <article className="card shift-card"><div className="shift-main"><div><p className="shift-date">{shiftTime(shift.start_at, shift.end_at)}</p>{shift.note && <p className="muted">{shift.note}</p>}</div><Status value={sheet?.status ?? (shift.missing ? "MISSING" : "ROSTERED")} /></div>
    {sheet && <div className="shift-details"><span>Worked: {shiftTime(sheet.start_at, sheet.end_at)}</span><span>{hours(sheet.start_at, sheet.end_at)}</span>{sheet.expenses.length > 0 && <span>{sheet.expenses.length} expense{sheet.expenses.length > 1 ? "s" : ""} · {money(sheet.expenses.reduce((n, e) => n + e.amount_cents, 0))}</span>}</div>}
    {sheet?.admin_note && <Notice tone="error">Admin note: {sheet.admin_note}</Notice>}
    {editing ? <TimesheetEditor shift={shift} onSave={onSave} onCancel={onCancel} /> : sheet?.status !== "APPROVED" && <Button secondary onClick={onEdit}>{sheet ? "Edit timesheet" : "Enter timesheet"}</Button>}
  </article>;
}

export function AdminDashboard({ call, getToken }: { call: Caller; getToken: () => Promise<string | null> }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [tab, setTab] = useState<"review" | "roster" | "people" | "export">("review");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const load = useCallback(async () => { try { setOverview(await call<Overview>("/api/admin/overview")); setError(""); } catch (cause) { setError((cause as Error).message); } }, [call]);
  useEffect(() => { void load(); }, [load]);
  async function act(job: () => Promise<unknown>, success = "Saved."): Promise<boolean> { setError(""); setMessage(""); try { await job(); await load(); setMessage(success); return true; } catch (cause) { setError((cause as Error).message); return false; } }
  const pending = overview?.users.filter((user) => user.status === "PENDING" && user.role === "TRANSLATOR").length ?? 0;
  const missing = overview?.shifts.filter((shift) => shift.missing).length ?? 0;
  const review = overview?.shifts.filter((shift) => shift.timesheet?.status === "SUBMITTED").length ?? 0;
  return <div className="page-stack"><div className="page-title"><div><span className="eyebrow">ADMIN</span><h1>Roster & approvals</h1><p>Review worked hours, track missing timesheets, and prepare MYOB exports.</p></div></div>
    <div className="stat-grid"><div className="stat"><strong>{review}</strong><span>Awaiting approval</span></div><div className="stat"><strong>{missing}</strong><span>Missing timesheets</span></div><div className="stat"><strong>{pending}</strong><span>New sign-ups</span></div></div>
    <nav className="tabbar" aria-label="Admin sections">{(["review", "roster", "people", "export"] as const).map((name) => <button key={name} className={tab === name ? "active" : ""} onClick={() => { setTab(name); setMessage(""); }}>{name === "people" ? `People${pending ? ` (${pending})` : ""}` : name[0].toUpperCase() + name.slice(1)}</button>)}</nav>
    {error && <Notice tone="error">{error}</Notice>}{message && <Notice tone="success">{message}</Notice>}{!overview && !error && <p>Loading admin dashboard…</p>}
    {overview && tab === "review" && <ReviewPanel overview={overview} call={call} act={act} />}
    {overview && tab === "roster" && <RosterPanel overview={overview} call={call} act={act} />}
    {overview && tab === "people" && <PeoplePanel overview={overview} call={call} act={act} />}
    {overview && tab === "export" && <ExportPanel overview={overview} call={call} getToken={getToken} act={act} />}
  </div>;
}

function ReviewPanel({ overview, call, act }: { overview: Overview; call: Caller; act: (job: () => Promise<unknown>, success?: string) => Promise<boolean> }) {
  const pending = overview.shifts.filter((shift) => shift.timesheet?.status === "SUBMITTED");
  const missing = overview.shifts.filter((shift) => shift.missing);
  const approved = overview.shifts.filter((shift) => shift.timesheet?.status === "APPROVED");
  const rejected = overview.shifts.filter((shift) => shift.timesheet?.status === "REJECTED");
  return <div className="page-stack"><section><div className="section-head"><h2>Needs review</h2><span className="count">{pending.length}</span></div>{pending.length === 0 && <div className="empty">No timesheets waiting for approval.</div>}<div className="card-list">{pending.map((shift) => <ReviewCard key={shift.id} shift={shift} call={call} act={act} />)}</div></section>
    <section><div className="section-head"><h2>Missing timesheets</h2><span className="count">{missing.length}</span></div><p className="muted section-note">Shown from 9am Sydney time the morning after a shift ends.</p>{missing.length === 0 && <div className="empty">No missing timesheets.</div>}{missing.map((shift) => <article className="card compact" key={shift.id}><strong>{shift.user ? fullName(shift.user) : "Translator"}</strong><span>{shiftTime(shift.start_at, shift.end_at)}</span><Status value="MISSING" /></article>)}</section>
    <section><div className="section-head"><h2>Approved hours</h2></div><div className="table-wrap"><table><thead><tr><th>Translator</th><th>Approved total</th><th>Standard</th><th>Sunday</th></tr></thead><tbody>{overview.users.filter((u) => u.role === "TRANSLATOR").map((user) => <tr key={user.id}><td>{fullName(user)}</td><td>{(overview.totals[user.id]?.total ?? 0).toFixed(2)} h</td><td>{(overview.totals[user.id]?.standard ?? 0).toFixed(2)} h</td><td>{(overview.totals[user.id]?.sunday ?? 0).toFixed(2)} h</td></tr>)}</tbody></table></div></section>
    {(approved.length > 0 || rejected.length > 0) && <section><h2>Recent decisions</h2><div className="card-list">{[...rejected, ...approved].sort((a, b) => b.start_at.localeCompare(a.start_at)).slice(0, 30).map((shift) => <ReviewCard key={shift.id} shift={shift} call={call} act={act} />)}</div></section>}
  </div>;
}

function ReviewCard({ shift, call, act }: { shift: Shift; call: Caller; act: (job: () => Promise<unknown>, success?: string) => Promise<boolean> }) {
  const sheet = shift.timesheet!;
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState("");
  const update = (data: object) => call(`/api/admin/timesheets/${sheet.id}`, { method: "PATCH", body: JSON.stringify(data) });
  return <article className="card review-card"><div className="shift-main"><div><strong>{shift.user ? fullName(shift.user) : "Translator"}</strong><p className="muted">Roster: {shiftTime(shift.start_at, shift.end_at)}</p><p>Worked: {shiftTime(sheet.start_at, sheet.end_at)}</p><p className="emphasis">{hours(sheet.start_at, sheet.end_at)}</p></div><Status value={sheet.status} /></div>
    {sheet.expenses.length > 0 && <div className="review-expenses"><h4>Expenses</h4>{sheet.expenses.map((expense: Expense) => <p key={expense.id}>{expense.incurred_on} · {expense.description} · {money(expense.amount_cents)} · Receipt {expense.receipt_sent ? "sent" : "not yet sent"}</p>)}</div>}
    {sheet.admin_note && <p className="muted">Admin note: {sheet.admin_note}</p>}
    {editing ? <TimesheetEditor shift={shift} admin onCancel={() => setEditing(false)} onSave={async (data) => { const saved = await act(() => update({ ...data, action: "edit" }), "Correction saved. Approve when ready."); if (!saved) throw new Error("Correction could not be saved."); setEditing(false); }} /> : <div className="actions">
      {sheet.status === "SUBMITTED" && <><Button onClick={() => void act(() => update({ action: "approve" }), "Timesheet approved.")}>Approve</Button><Button secondary onClick={() => setEditing(true)}>Correct</Button></>}
      {sheet.status === "APPROVED" && <Button secondary onClick={() => void act(() => update({ action: "reopen", note: "Reopened for correction" }), "Timesheet reopened.")}>Reopen</Button>}
      {sheet.status === "REJECTED" && <Button secondary onClick={() => setEditing(true)}>Correct</Button>}
    </div>}
    {sheet.status === "SUBMITTED" && !editing && <div className="reject-row"><input aria-label="Reason to send back" placeholder="Reason to send back" value={reason} onChange={(e) => setReason(e.target.value)} /><Button secondary disabled={!reason.trim()} onClick={() => void act(() => update({ action: "reject", note: reason }), "Timesheet sent back.")}>Send back</Button></div>}
  </article>;
}

function RosterPanel({ overview, call, act }: { overview: Overview; call: Caller; act: (job: () => Promise<unknown>, success?: string) => Promise<boolean> }) {
  const people = overview.users.filter((user) => user.role === "TRANSLATOR" && user.status === "ACTIVE");
  const shiftsByPerson = new Map<string, Shift[]>();
  for (const shift of overview.shifts) shiftsByPerson.set(shift.user_id, [...(shiftsByPerson.get(shift.user_id) ?? []), shift]);
  const rosterGroups = [...shiftsByPerson].map(([id, shifts]) => ({
    id,
    name: (() => { const user = overview.users.find((person) => person.id === id) ?? shifts[0].user; return user ? fullName(user) : "Unknown translator"; })(),
    shifts: shifts.sort((a, b) => a.start_at.localeCompare(b.start_at)),
  })).sort((a, b) => a.name.localeCompare(b.name));
  const [userId, setUserId] = useState(people[0]?.id ?? "");
  const [startLocal, setStart] = useState("");
  const [endLocal, setEnd] = useState("");
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  function edit(shift: Shift) { setEditing(shift.id); setUserId(shift.user_id); setStart(localInput(shift.start_at)); setEnd(localInput(shift.end_at)); setNote(shift.note); window.scrollTo({ top: 0, behavior: "smooth" }); }
  async function submit(event: FormEvent) { event.preventDefault(); const id = editing; const saved = await act(() => call(id ? `/api/admin/shifts/${id}` : "/api/admin/shifts", { method: id ? "PATCH" : "POST", body: JSON.stringify({ userId, startLocal, endLocal, note }) }), id ? "Shift updated." : "Shift added."); if (saved) { if (!id) { setStart(""); setEnd(""); setNote(""); } else setEditing(null); } }
  return <div className="page-stack"><form className="card form-stack" onSubmit={(e) => void submit(e)}><div><h2>{editing ? "Edit shift" : "Add a shift"}</h2><p className="muted">Enter all dates and times in Sydney time. Overnight shifts are supported.</p></div>
    <label>Translator<select value={userId} onChange={(e) => setUserId(e.target.value)} disabled={!!editing} required><option value="">Choose a translator</option>{people.map((person) => <option value={person.id} key={person.id}>{fullName(person)}</option>)}</select></label>
    <div className="form-grid"><label>Start<input type="datetime-local" step="900" value={startLocal} onChange={(e) => setStart(e.target.value)} required /></label><label>End<input type="datetime-local" step="900" value={endLocal} onChange={(e) => setEnd(e.target.value)} required /></label></div>
    <label>Note <span className="muted">(optional)</span><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Tour or meeting point" /></label>
    <div className="actions"><Button>{editing ? "Save shift" : "Add shift"}</Button>{editing && <Button type="button" secondary onClick={() => { setEditing(null); setStart(""); setEnd(""); setNote(""); }}>Cancel</Button>}</div></form>
    <section><div className="section-head"><h2>Rostered shifts by translator</h2><span className="count">{overview.shifts.length}</span></div>
      {rosterGroups.length === 0 && <div className="empty">No shifts have been rostered yet.</div>}
      <div className="roster-groups">{rosterGroups.map((group) => <details className="roster-group" key={group.id}><summary><strong>{group.name}</strong><span className="roster-group-meta">{group.shifts.length} shift{group.shifts.length === 1 ? "" : "s"}</span><span className="roster-chevron" aria-hidden="true">⌄</span></summary>
        <div className="roster-rows">{group.shifts.map((shift) => <article className="roster-row" key={shift.id}><div className="roster-row-time"><strong>{shiftTime(shift.start_at, shift.end_at)}</strong>{shift.note && <p className="muted">{shift.note}</p>}</div><Status value={shift.timesheet?.status ?? (shift.missing ? "MISSING" : "ROSTERED")} /><div className="actions"><Button secondary onClick={() => edit(shift)}>Edit</Button>{!shift.timesheet && <button className="text-button danger" onClick={() => { if (window.confirm("Delete this shift?")) void act(() => call(`/api/admin/shifts/${shift.id}`, { method: "DELETE" }), "Shift deleted."); }}>Delete</button>}</div></article>)}</div>
      </details>)}</div></section>
  </div>;
}

function PeoplePanel({ overview, call, act }: { overview: Overview; call: Caller; act: (job: () => Promise<unknown>, success?: string) => Promise<boolean> }) {
  const users = overview.users.filter((user) => user.role === "TRANSLATOR");
  return <div className="page-stack"><div><h2>Translators</h2><p className="muted">New accounts wait here until an admin activates them. Add each person’s MYOB card ID before exporting payroll.</p></div><div className="card-list">{users.map((user) => <PersonCard key={user.id} user={user} call={call} act={act} />)}</div></div>;
}

function PersonCard({ user, call, act }: { user: User; call: Caller; act: (job: () => Promise<unknown>, success?: string) => Promise<boolean> }) {
  const [first, setFirst] = useState(user.legal_first_name);
  const [surname, setSurname] = useState(user.surname);
  const [nickname, setNickname] = useState(user.nickname);
  const [card, setCard] = useState(user.myob_card_id);
  async function save(status = user.status) { await act(() => call(`/api/admin/users/${user.id}`, { method: "PATCH", body: JSON.stringify({ legalFirstName: first, surname, nickname, myobCardId: card, status }) }), status === "ACTIVE" && user.status !== "ACTIVE" ? "Translator activated." : "Translator updated."); }
  return <article className="card form-stack"><div className="shift-main"><div><strong>{fullName(user)}</strong><p className="muted">{user.email}</p></div><Status value={user.status} /></div>
    <div className="form-grid"><label>Legal first name<input value={first} onChange={(e) => setFirst(e.target.value)} maxLength={20} /></label><label>Surname<input value={surname} onChange={(e) => setSurname(e.target.value)} maxLength={30} /></label><label>Nickname<input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={80} /></label><label>MYOB card ID<input value={card} onChange={(e) => setCard(e.target.value)} maxLength={15} placeholder="From MYOB employee record" /></label></div>
    <div className="actions"><Button secondary onClick={() => void save()}>Save details</Button>{user.status !== "ACTIVE" && <Button onClick={() => void save("ACTIVE")}>Activate</Button>}{user.status === "ACTIVE" && <Button secondary onClick={() => void save("INACTIVE")}>Deactivate</Button>}</div>
  </article>;
}

function ExportPanel({ overview, call, getToken, act }: { overview: Overview; call: Caller; getToken: () => Promise<string | null>; act: (job: () => Promise<unknown>, success?: string) => Promise<boolean> }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [standard, setStandard] = useState(overview.settings.standard_payroll_category ?? "");
  const [sunday, setSunday] = useState(overview.settings.sunday_payroll_category ?? "");
  const [error, setError] = useState("");
  async function get(kind: "review" | "myob" | "expenses") {
    setError("");
    try { const query = new URLSearchParams({ kind, ...(from ? { from } : {}), ...(to ? { to } : {}) }); await download(getToken, `/api/admin/export?${query}`, kind === "myob" ? "myob-timesheets.txt" : kind === "expenses" ? "approved-expenses.csv" : "approved-hours.csv"); }
    catch (cause) { setError((cause as Error).message); }
  }
  return <div className="page-stack"><div className="card form-stack"><div><h2>Export approved work</h2><p className="muted">Choose a Sydney date range. Only approved timesheets and their expenses are included.</p></div><div className="form-grid"><label>From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label>To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label></div>{error && <Notice tone="error">{error}</Notice>}
    <div className="export-grid"><div><h3>Hours report</h3><p>Readable CSV with rostered and actual times, hours worked and Standard or Sunday classification. Overnight shifts use one row per date.</p><Button secondary onClick={() => void get("review")}>Download hours CSV</Button></div><div><h3>MYOB timesheets</h3><p>Tab-delimited MYOB import file, one row per day and payroll category. Requires each employee’s MYOB card ID.</p><Button onClick={() => void get("myob")}>Download MYOB file</Button></div><div><h3>Reimbursements</h3><p>Separate expense CSV with descriptions, amounts and receipt confirmation. Review before processing reimbursements in MYOB.</p><Button secondary onClick={() => void get("expenses")}>Download expenses CSV</Button></div></div></div>
    <form className="card form-stack" onSubmit={(e) => { e.preventDefault(); void act(() => call("/api/admin/settings", { method: "PATCH", body: JSON.stringify({ standard, sunday }) }), "MYOB categories saved."); }}><div><h2>MYOB payroll categories</h2><p className="muted">These names must match the pay items in your MYOB Business file exactly.</p></div><div className="form-grid"><label>Standard hours<input value={standard} maxLength={31} onChange={(e) => setStandard(e.target.value)} required /></label><label>Sunday hours<input value={sunday} maxLength={31} onChange={(e) => setSunday(e.target.value)} required /></label></div><Button>Save categories</Button></form>
  </div>;
}

export default function App() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { signOut } = useClerk();
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const call = useCallback<Caller>((path, options) => api(() => getToken(), path, options), [getToken]);
  const load = useCallback(async () => { setLoading(true); try { const result = await call<{ user: User }>("/api/me"); setUser(result.user); setError(""); } catch (cause) { setError((cause as Error).message); } finally { setLoading(false); } }, [call]);
  useEffect(() => { if (isLoaded && isSignedIn) void load(); else if (isLoaded) { setUser(null); setLoading(false); } }, [isLoaded, isSignedIn, load]);
  if (!isLoaded) return <main className="loading-screen">Loading sign-in…</main>;
  if (!isSignedIn) return <AuthView />;
  return <div className="app-shell"><header className="topbar"><div className="brand"><span className="brand-mark">C</span><span>Courant <small>Roster</small></span></div><div className="top-actions"><span className="account-name">{user ? displayName(user) : ""}</span><button onClick={() => void signOut()} className="text-button">Sign out</button></div></header><main className="content">
    {loading && <p>Loading your account…</p>}{error && <Notice tone="error">{error}</Notice>}
    {user && !loading && (user.role === "ADMIN" ? <AdminDashboard call={call} getToken={() => getToken()} /> : user.status === "ACTIVE" ? <TranslatorDashboard call={call} /> : <div className="pending-page"><span className="eyebrow">ACCOUNT STATUS</span><h1>{user.status === "PENDING" ? "Waiting for activation" : "Account inactive"}</h1><p>{user.status === "PENDING" ? "An admin will activate your account before you can see your roster. You can add or correct your name now." : "Ask an admin if you need access again."}</p><ProfileForm user={user} call={call} onSaved={load} /></div>)}
  </main></div>;
}
