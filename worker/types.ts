import type { D1Database } from "@cloudflare/workers-types";

export interface Env {
  DB: D1Database;
  CLERK_SECRET_KEY: string;
  CLERK_JWT_KEY: string;
  ADMIN_EMAILS: string;
  APP_URL: string;
  /** Days of error_logs history to keep. Defaults to 90 when unset or invalid. */
  ERROR_LOG_RETENTION_DAYS?: string;
  /** Optional. Enables the beta "Read with AI" roster import. */
  DEEPSEEK_API_KEY?: string;
  /** Optional DeepSeek model name. Defaults to deepseek-chat. */
  DEEPSEEK_MODEL?: string;
}

export type User = {
  id: string;
  /** Null until a person added by a roster import signs up. */
  clerk_id: string | null;
  email: string;
  legal_first_name: string;
  surname: string;
  nickname: string;
  role: "ADMIN" | "TRANSLATOR";
  status: "PENDING" | "ACTIVE" | "INACTIVE";
  myob_card_id: string;
  created_at: string;
  updated_at: string;
};

export type Shift = {
  id: string;
  user_id: string;
  start_at: string;
  end_at: string;
  note: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type Timesheet = {
  id: string;
  shift_id: string;
  user_id: string;
  start_at: string;
  end_at: string;
  status: "SUBMITTED" | "APPROVED" | "REJECTED";
  admin_note: string;
  submitted_at: string;
  updated_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
};

export type Expense = {
  id: string;
  timesheet_id: string;
  incurred_on: string;
  description: string;
  amount_cents: number;
  receipt_sent: number;
};

export type ShiftView = Shift & { timesheet: (Timesheet & { expenses: Expense[] }) | null; user?: User; missing?: boolean };
