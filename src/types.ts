export type User = {
  id: string; clerk_id?: string | null; email: string; legal_first_name: string; surname: string; nickname: string;
  role: "ADMIN" | "TRANSLATOR"; status: "PENDING" | "ACTIVE" | "INACTIVE"; myob_card_id: string;
};
export type Expense = { id: string; timesheet_id: string; incurred_on: string; description: string; amount_cents: number; receipt_sent: number };
export type Timesheet = { id: string; shift_id: string; start_at: string; end_at: string; status: "SUBMITTED" | "APPROVED" | "REJECTED"; admin_note: string; expenses: Expense[] };
export type Shift = { id: string; user_id: string; start_at: string; end_at: string; note: string; missing: boolean; user?: User; timesheet: Timesheet | null };
export type Overview = {
  users: User[]; shifts: Shift[];
  totals: Record<string, { standard: number; sunday: number; total: number }>;
  settings: Record<string, string>;
  /** Whether the beta AI roster reader is configured. */
  aiImport?: boolean;
};
