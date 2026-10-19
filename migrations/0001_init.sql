CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  legal_first_name TEXT NOT NULL DEFAULT '',
  surname TEXT NOT NULL DEFAULT '',
  nickname TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'TRANSLATOR' CHECK (role IN ('ADMIN', 'TRANSLATOR')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACTIVE', 'INACTIVE')),
  myob_card_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE shifts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (end_at > start_at)
);
CREATE INDEX shifts_user_start ON shifts(user_id, start_at);

CREATE TABLE timesheets (
  id TEXT PRIMARY KEY,
  shift_id TEXT NOT NULL UNIQUE REFERENCES shifts(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED', 'APPROVED', 'REJECTED')),
  admin_note TEXT NOT NULL DEFAULT '',
  submitted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  reviewed_at TEXT,
  reviewed_by TEXT REFERENCES users(id),
  CHECK (end_at > start_at)
);
CREATE INDEX timesheets_user_status ON timesheets(user_id, status);

CREATE TABLE expenses (
  id TEXT PRIMARY KEY,
  timesheet_id TEXT NOT NULL REFERENCES timesheets(id) ON DELETE CASCADE,
  incurred_on TEXT NOT NULL,
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  receipt_sent INTEGER NOT NULL DEFAULT 0 CHECK (receipt_sent IN (0, 1))
);
CREATE INDEX expenses_timesheet ON expenses(timesheet_id);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO settings(key, value) VALUES ('standard_payroll_category', 'Base Hourly');
INSERT INTO settings(key, value) VALUES ('sunday_payroll_category', 'Sunday');

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX audit_entity ON audit_logs(entity_type, entity_id, created_at);
