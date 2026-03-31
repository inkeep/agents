-- Backfill allowAnonymous for existing web_client apps.
-- The runtime previously treated undefined as "allow anonymous".
-- Now the schema defaults to false, so set existing apps to true
-- to preserve their current behavior.
UPDATE apps
SET config = jsonb_set(
  config,
  '{webClient,auth,allowAnonymous}',
  'true'::jsonb,
  true
)
WHERE type = 'web_client'
  AND (config->'webClient'->'auth'->'allowAnonymous') IS NULL;--> statement-breakpoint
UPDATE apps
SET config = jsonb_set(
  config,
  '{webClient,auth,allowAnonymous}',
  'false'::jsonb
)
WHERE id = 'app_playground';
