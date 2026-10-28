CREATE TABLE error_logs (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('warn', 'error')),
  status INTEGER NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  code TEXT NOT NULL,
  message TEXT NOT NULL,
  stack TEXT NOT NULL DEFAULT '',
  user_id TEXT NOT NULL DEFAULT '',
  user_email TEXT NOT NULL DEFAULT '',
  request_id TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX error_logs_created ON error_logs(created_at);
CREATE INDEX error_logs_status_created ON error_logs(status, created_at);
