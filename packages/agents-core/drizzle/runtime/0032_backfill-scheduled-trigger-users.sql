-- Backfill scheduled_trigger_users from the legacy scalar scheduled_triggers.run_as_user_id.
-- This is idempotent so it is safe to run in environments where some rows were already copied.
INSERT INTO "scheduled_trigger_users" ("tenant_id", "scheduled_trigger_id", "user_id")
SELECT "tenant_id", "id", "run_as_user_id"
FROM "scheduled_triggers"
WHERE "run_as_user_id" IS NOT NULL
ON CONFLICT DO NOTHING;
