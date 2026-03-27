-- Custom SQL migration file, put your code below! --
INSERT INTO "apps" ("id", "name", "description", "type", "enabled", "config", "created_at", "updated_at")
VALUES (
  'app_playground',
  'Playground',
  'Global playground app for the manage UI',
  'web_client',
  true,
  '{"type": "web_client", "webClient": {"allowedDomains": ["*"], "auth": {"publicKeys": [], "validateScopeClaims": true}}}',
  now(),
  now()
)
ON CONFLICT ("id") DO NOTHING;
