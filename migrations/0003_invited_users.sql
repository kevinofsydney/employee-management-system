-- Roster imports add people before they have a Clerk account. users.id stays the internal key that
-- shifts and timesheets reference; clerk_id links the row to a sign-in once the person signs up.
-- Existing rows were keyed by their Clerk ID, so it carries over unchanged.
ALTER TABLE users ADD COLUMN clerk_id TEXT;
UPDATE users SET clerk_id = id;
CREATE UNIQUE INDEX users_clerk_id ON users(clerk_id);
