-- Flatten auth config: move fields from webClient.auth.* to webClient.*,
-- backfill allowAnonymous, and remove validateScopeClaims (now always-on for global apps).

-- Step 1: For apps that have a nested auth object, hoist its fields up to webClient.
-- This moves publicKeys, audience, and allowAnonymous from webClient.auth to webClient
-- directly, then removes the auth key. validateScopeClaims is intentionally not hoisted
-- as it is being removed (scope validation is now always-on for global apps).
UPDATE apps
SET config = jsonb_set(
  jsonb_set(
    jsonb_set(
      config #- '{webClient,auth}',
      '{webClient,publicKeys}',
      COALESCE(config->'webClient'->'auth'->'publicKeys', '[]'::jsonb)
    ),
    '{webClient,audience}',
    COALESCE(config->'webClient'->'auth'->'audience', 'null'::jsonb)
  ),
  '{webClient,allowAnonymous}',
  COALESCE(config->'webClient'->'auth'->'allowAnonymous', 'null'::jsonb)
)
WHERE type = 'web_client'
  AND config->'webClient'->'auth' IS NOT NULL;--> statement-breakpoint
-- Step 2: Clean up null-valued fields that were hoisted from a missing auth sub-field.
UPDATE apps
SET config = config #- '{webClient,audience}'
WHERE type = 'web_client'
  AND config->'webClient'->'audience' = 'null'::jsonb;--> statement-breakpoint
UPDATE apps
SET config = config #- '{webClient,allowAnonymous}'
WHERE type = 'web_client'
  AND config->'webClient'->'allowAnonymous' = 'null'::jsonb;--> statement-breakpoint
-- Step 3: Remove validateScopeClaims from all apps (now always-on for global apps).
UPDATE apps
SET config = config #- '{webClient,validateScopeClaims}'
WHERE type = 'web_client'
  AND config->'webClient'->'validateScopeClaims' IS NOT NULL;--> statement-breakpoint
-- Step 4: Backfill allowAnonymous=true for apps that still don't have it set
-- (preserves existing "allow anonymous" behavior for old apps).
UPDATE apps
SET config = jsonb_set(
  config,
  '{webClient,allowAnonymous}',
  'true'::jsonb,
  true
)
WHERE type = 'web_client'
  AND (config->'webClient'->'allowAnonymous') IS NULL;--> statement-breakpoint
-- Step 5: Set playground app to require authentication.
UPDATE apps
SET config = jsonb_set(
  config,
  '{webClient,allowAnonymous}',
  'false'::jsonb
)
WHERE id = 'app_playground';
