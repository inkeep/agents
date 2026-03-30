---
name: pr-context
description: Local review context generated from git state.
---

# PR Review Context

(!IMPORTANT)

Use this context to:
1. Get an initial sense of the purpose and scope of the local changes
2. Review the current branch against the target branch without relying on GitHub APIs
3. Identify what needs attention before the changes are pushed

---

## PR Metadata

| Field | Value |
|---|---|
| **PR** | Local review — feat/enforce-app-auth vs main |
| **Author** | Andrew Mikofalvy |
| **Base** | `main` |
| **Repo** | inkeep/agents |
| **Head SHA** | `537ea3d2c3751fc51f659f49953fc70b85c7bcb4` |
| **Size** | 8 commits · +643/-8 · 13 files |
| **Labels** | _None — local review._ |
| **Review state** | LOCAL |
| **Diff mode** | `inline` — full tracked diff included below |
| **Event** | `local:manual` |
| **Trigger command** | `local-review` |
| **Review scope** | `full` — local review uses the full branch diff against the target branch |

## Description

Local review — no PR description is available.

## Linked Issues

_No linked issues in local review mode._

## Commit History

Commits reachable from HEAD and not in the target branch (oldest → newest). Local staged and unstaged changes may also be present in the diff below.

```
c5e862d9d Version Packages (#2881)
3debd2e5f fix(ci): configure git remote with App token in release workflow (#2901)
803777f84 Add Require Authentication toggle for web client apps
a18f2cef7 Update app credentials docs with Require Authentication toggle
e1a6fd01b Add changesets for enforce-app-auth feature
e206624e1 perf(ci): skip container init for changeset PRs (#2902)
690d86227 fixup! local-review: address findings (pass 1)
537ea3d2c fixup! local-review: baseline (pre-review state)
```

## Changed Files

Per-file diff stats (for prioritizing review effort). Untracked files are listed below but are not converted into synthetic patch text by this generator:

```
 .changeset/abundant-bronze-dragon.md               |   5 +
 .changeset/tasteless-rose-ostrich.md               |   5 +
 agents-api/__snapshots__/openapi.json              | 156 +++++++++++++++++++++
 .../manage/routes/crud/appAuthKeys.test.ts         | 147 ++++++++++++++++++-
 .../src/domains/manage/routes/appAuthKeys.ts       |  90 ++++++++++++
 .../content/api-reference/(openapi)/apps.mdx       |   9 +-
 .../(chat-components)/app-credentials.mdx          |  12 +-
 .../src/components/apps/auth-keys-section.tsx      |  50 ++++++-
 .../src/components/apps/form/app-update-form.tsx   |  15 +-
 ...uld-properly-highlight-nested-error-state-1.png | Bin 0 -> 12046 bytes
 agents-manage-ui/src/lib/actions/app-auth-keys.ts  |  23 +++
 agents-manage-ui/src/lib/api/app-auth-keys.ts      |  15 ++
 specs/enforce-app-auth/SPEC.md                     | 124 ++++++++++++++++
 13 files changed, 643 insertions(+), 8 deletions(-)
```

Full file list (including untracked files when present):

```
.changeset/abundant-bronze-dragon.md
.changeset/tasteless-rose-ostrich.md
agents-api/__snapshots__/openapi.json
agents-api/src/__tests__/manage/routes/crud/appAuthKeys.test.ts
agents-api/src/domains/manage/routes/appAuthKeys.ts
agents-docs/content/api-reference/(openapi)/apps.mdx
agents-docs/content/talk-to-your-agents/(chat-components)/app-credentials.mdx
agents-manage-ui/src/components/apps/auth-keys-section.tsx
agents-manage-ui/src/components/apps/form/app-update-form.tsx
agents-manage-ui/src/components/form/__tests__/__screenshots__/form.browser.test.tsx/Form-should-properly-highlight-nested-error-state-1.png
agents-manage-ui/src/lib/actions/app-auth-keys.ts
agents-manage-ui/src/lib/api/app-auth-keys.ts
specs/enforce-app-auth/SPEC.md
```

## Diff

```diff
diff --git a/.changeset/abundant-bronze-dragon.md b/.changeset/abundant-bronze-dragon.md
new file mode 100644
index 000000000..d3be6514c
--- /dev/null
+++ b/.changeset/abundant-bronze-dragon.md
@@ -0,0 +1,5 @@
+---
+"@inkeep/agents-api": patch
+---
+
+Add PATCH /auth/keys/settings endpoint to update app auth settings (allowAnonymous)
diff --git a/.changeset/tasteless-rose-ostrich.md b/.changeset/tasteless-rose-ostrich.md
new file mode 100644
index 000000000..b3b6d865c
--- /dev/null
+++ b/.changeset/tasteless-rose-ostrich.md
@@ -0,0 +1,5 @@
+---
+"@inkeep/agents-manage-ui": patch
+---
+
+Add Require Authentication toggle for web client apps
diff --git a/agents-api/__snapshots__/openapi.json b/agents-api/__snapshots__/openapi.json
index 0846d683d..8d0403717 100644
--- a/agents-api/__snapshots__/openapi.json
+++ b/agents-api/__snapshots__/openapi.json
@@ -1407,6 +1407,25 @@
         },
         "type": "object"
       },
+      "AuthSettingsResponse": {
+        "properties": {
+          "data": {
+            "properties": {
+              "allowAnonymous": {
+                "type": "boolean"
+              }
+            },
+            "required": [
+              "allowAnonymous"
+            ],
+            "type": "object"
+          }
+        },
+        "required": [
+          "data"
+        ],
+        "type": "object"
+      },
       "BadRequest": {
         "allOf": [
           {
@@ -10547,6 +10566,18 @@
           }
         ]
       },
+      "UpdateAuthSettingsRequest": {
+        "properties": {
+          "allowAnonymous": {
+            "description": "Whether anonymous access is allowed when JWT verification fails",
+            "type": "boolean"
+          }
+        },
+        "required": [
+          "allowAnonymous"
+        ],
+        "type": "object"
+      },
       "UserId": {
         "description": "User identifier",
         "example": "user_123",
@@ -26069,6 +26100,131 @@
         }
       }
     },
+    "/manage/tenants/{tenantId}/projects/{projectId}/apps/{appId}/auth/keys/settings": {
+      "patch": {
+        "description": "Update authentication settings for a web client app",
+        "operationId": "update-app-auth-settings",
+        "parameters": [
+          {
+            "description": "Tenant identifier",
+            "in": "path",
+            "name": "tenantId",
+            "required": true,
+            "schema": {
+              "$ref": "#/components/schemas/TenantIdPathParam"
+            }
+          },
+          {
+            "description": "Project identifier",
+            "in": "path",
+            "name": "projectId",
+            "required": true,
+            "schema": {
+              "$ref": "#/components/schemas/ProjectIdPathParam"
+            }
+          },
+          {
+            "in": "path",
+            "name": "appId",
+            "required": true,
+            "schema": {
+              "minLength": 1,
+              "type": "string"
+            }
+          }
+        ],
+        "requestBody": {
+          "content": {
+            "application/json": {
+              "schema": {
+                "$ref": "#/components/schemas/UpdateAuthSettingsRequest"
+              }
+            }
+          }
+        },
+        "responses": {
+          "200": {
+            "content": {
+              "application/json": {
+                "schema": {
+                  "$ref": "#/components/schemas/AuthSettingsResponse"
+                }
+              }
+            },
+            "description": "Auth settings updated"
+          },
+          "400": {
+            "content": {
+              "application/problem+json": {
+                "schema": {
+                  "$ref": "#/components/schemas/BadRequest"
+                }
+              }
+            },
+            "description": "Bad Request"
+          },
+          "401": {
+            "content": {
+              "application/problem+json": {
+                "schema": {
+                  "$ref": "#/components/schemas/Unauthorized"
+                }
+              }
+            },
+            "description": "Unauthorized"
+          },
+          "403": {
+            "content": {
+              "application/problem+json": {
+                "schema": {
+                  "$ref": "#/components/schemas/Forbidden"
+                }
+              }
+            },
+            "description": "Forbidden"
+          },
+          "404": {
+            "content": {
+              "application/problem+json": {
+                "schema": {
+                  "$ref": "#/components/schemas/NotFound"
+                }
+              }
+            },
+            "description": "Not Found"
+          },
+          "422": {
+            "content": {
+              "application/problem+json": {
+                "schema": {
+                  "$ref": "#/components/schemas/UnprocessableEntity"
+                }
+              }
+            },
+            "description": "Unprocessable Entity"
+          },
+          "500": {
+            "content": {
+              "application/problem+json": {
+                "schema": {
+                  "$ref": "#/components/schemas/InternalServerError"
+                }
+              }
+            },
+            "description": "Internal Server Error"
+          }
+        },
+        "summary": "Update Auth Settings",
+        "tags": [
+          "Apps"
+        ],
+        "x-authz": {
+          "description": "Requires project edit permission (project_admin, or org admin/owner)",
+          "permission": "edit",
+          "resource": "project"
+        }
+      }
+    },
     "/manage/tenants/{tenantId}/projects/{projectId}/apps/{appId}/auth/keys/{kid}": {
       "delete": {
         "description": "Remove a public key by kid",
diff --git a/agents-api/src/__tests__/manage/routes/crud/appAuthKeys.test.ts b/agents-api/src/__tests__/manage/routes/crud/appAuthKeys.test.ts
index f5811ed09..4a3f1340e 100644
--- a/agents-api/src/__tests__/manage/routes/crud/appAuthKeys.test.ts
+++ b/agents-api/src/__tests__/manage/routes/crud/appAuthKeys.test.ts
@@ -33,8 +33,11 @@ describe('App Auth Keys Routes', () => {
     return body.data.app;
   };
 
+  const appUrl = (tenantId: string, projectId: string, appId: string) =>
+    `/manage/tenants/${tenantId}/projects/${projectId}/apps/${appId}`;
+
   const keysUrl = (tenantId: string, projectId: string, appId: string) =>
-    `/manage/tenants/${tenantId}/projects/${projectId}/apps/${appId}/auth/keys`;
+    `${appUrl(tenantId, projectId, appId)}/auth/keys`;
 
   describe('POST /auth/keys', () => {
     it('should add a public key to an app', async () => {
@@ -191,6 +194,148 @@ describe('App Auth Keys Routes', () => {
     });
   });
 
+  describe('PATCH /auth/keys/settings', () => {
+    const settingsUrl = (tenantId: string, projectId: string, appId: string) =>
+      `${keysUrl(tenantId, projectId, appId)}/settings`;
+
+    it('should update allowAnonymous to false', async () => {
+      const tenantId = await createTestTenantWithOrg('auth-settings-false');
+      const projectId = 'default-project';
+      await createTestProject(manageDbClient, tenantId, projectId);
+      const app = await createTestApp(tenantId, projectId);
+
+      const res = await makeRequest(settingsUrl(tenantId, projectId, app.id), {
+        method: 'PATCH',
+        body: JSON.stringify({ allowAnonymous: false }),
+      });
+
+      expect(res.status).toBe(200);
+      const patchBody = await res.json();
+      expect(patchBody.data.allowAnonymous).toBe(false);
+
+      const getRes = await makeRequest(appUrl(tenantId, projectId, app.id));
+      const appBody = await getRes.json();
+      expect(appBody.data.config.webClient.auth.allowAnonymous).toBe(false);
+    });
+
+    it('should update allowAnonymous to true', async () => {
+      const tenantId = await createTestTenantWithOrg('auth-settings-true');
+      const projectId = 'default-project';
+      await createTestProject(manageDbClient, tenantId, projectId);
+      const app = await createTestApp(tenantId, projectId);
+
+      await makeRequest(settingsUrl(tenantId, projectId, app.id), {
+        method: 'PATCH',
+        body: JSON.stringify({ allowAnonymous: false }),
+      });
+
+      const res = await makeRequest(settingsUrl(tenantId, projectId, app.id), {
+        method: 'PATCH',
+        body: JSON.stringify({ allowAnonymous: true }),
+      });
+
+      expect(res.status).toBe(200);
+      const patchBody = await res.json();
+      expect(patchBody.data.allowAnonymous).toBe(true);
+
+      const getRes = await makeRequest(appUrl(tenantId, projectId, app.id));
+      const appBody = await getRes.json();
+      expect(appBody.data.config.webClient.auth.allowAnonymous).toBe(true);
+    });
+
+    it('should preserve existing keys when updating settings', async () => {
+      const tenantId = await createTestTenantWithOrg('auth-settings-preserve');
+      const projectId = 'default-project';
+      await createTestProject(manageDbClient, tenantId, projectId);
+      const app = await createTestApp(tenantId, projectId);
+
+      const pem = await rsaPem();
+      await makeRequest(keysUrl(tenantId, projectId, app.id), {
+        method: 'POST',
+        body: JSON.stringify({ kid: 'preserved-key', publicKey: pem, algorithm: 'RS256' }),
+      });
+
+      await makeRequest(settingsUrl(tenantId, projectId, app.id), {
+        method: 'PATCH',
+        body: JSON.stringify({ allowAnonymous: false }),
+      });
+
+      const listRes = await makeRequest(keysUrl(tenantId, projectId, app.id));
+      const body = await listRes.json();
+      expect(body.data).toHaveLength(1);
+      expect(body.data[0].kid).toBe('preserved-key');
+    });
+
+    it('should preserve audience when updating allowAnonymous', async () => {
+      const tenantId = await createTestTenantWithOrg('auth-settings-audience');
+      const projectId = 'default-project';
+      await createTestProject(manageDbClient, tenantId, projectId);
+      const app = await createTestApp(tenantId, projectId);
+
+      await makeRequest(appUrl(tenantId, projectId, app.id), {
+        method: 'PATCH',
+        body: JSON.stringify({
+          config: {
+            type: 'web_client',
+            webClient: {
+              allowedDomains: ['example.com'],
+              auth: { audience: 'https://my-app.example.com' },
+            },
+          },
+        }),
+      });
+
+      await makeRequest(settingsUrl(tenantId, projectId, app.id), {
+        method: 'PATCH',
+        body: JSON.stringify({ allowAnonymous: false }),
+      });
+
+      const getRes = await makeRequest(appUrl(tenantId, projectId, app.id));
+      const appBody = await getRes.json();
+      expect(appBody.data.config.webClient.auth.audience).toBe('https://my-app.example.com');
+      expect(appBody.data.config.webClient.auth.allowAnonymous).toBe(false);
+    });
+
+    it('should return 400 for api app type', async () => {
+      const tenantId = await createTestTenantWithOrg('auth-settings-api-app');
+      const projectId = 'default-project';
+      await createTestProject(manageDbClient, tenantId, projectId);
+
+      const createRes = await makeRequest(
+        `/manage/tenants/${tenantId}/projects/${projectId}/apps`,
+        {
+          method: 'POST',
+          body: JSON.stringify({
+            name: 'API App',
+            type: 'api',
+            config: { type: 'api', api: {} },
+          }),
+        }
+      );
+      const apiApp = (await createRes.json()).data.app;
+
+      const res = await makeRequest(settingsUrl(tenantId, projectId, apiApp.id), {
+        method: 'PATCH',
+        body: JSON.stringify({ allowAnonymous: false }),
+      });
+
+      expect(res.status).toBe(400);
+    });
+
+    it('should return 404 for non-existent app', async () => {
+      const tenantId = await createTestTenantWithOrg('auth-settings-404');
+      const projectId = 'default-project';
+      await createTestProject(manageDbClient, tenantId, projectId);
+
+      const res = await makeRequest(settingsUrl(tenantId, projectId, 'nonexistent-app'), {
+        method: 'PATCH',
+        body: JSON.stringify({ allowAnonymous: false }),
+      });
+
+      expect(res.status).toBe(404);
+    });
+  });
+
   describe('DELETE /auth/keys/:kid', () => {
     it('should delete a key by kid', async () => {
       const tenantId = await createTestTenantWithOrg('auth-keys-delete');
diff --git a/agents-api/src/domains/manage/routes/appAuthKeys.ts b/agents-api/src/domains/manage/routes/appAuthKeys.ts
index 13b5712cb..5cc22bb1a 100644
--- a/agents-api/src/domains/manage/routes/appAuthKeys.ts
+++ b/agents-api/src/domains/manage/routes/appAuthKeys.ts
@@ -240,4 +240,94 @@ app.openapi(
   }
 );
 
+const UpdateAuthSettingsRequestSchema = z
+  .object({
+    allowAnonymous: z
+      .boolean()
+      .describe('Whether anonymous access is allowed when JWT verification fails'),
+  })
+  .openapi('UpdateAuthSettingsRequest');
+
+const AuthSettingsResponseSchema = z
+  .object({
+    data: z.object({
+      allowAnonymous: z.boolean(),
+    }),
+  })
+  .openapi('AuthSettingsResponse');
+
+app.openapi(
+  createProtectedRoute({
+    method: 'patch',
+    path: '/settings',
+    summary: 'Update Auth Settings',
+    description: 'Update authentication settings for a web client app',
+    operationId: 'update-app-auth-settings',
+    tags: ['Apps'],
+    permission: requireProjectPermission('edit'),
+    request: {
+      params: AppAuthKeyParamsSchema,
+      body: {
+        content: {
+          'application/json': {
+            schema: UpdateAuthSettingsRequestSchema,
+          },
+        },
+      },
+    },
+    responses: {
+      200: {
+        description: 'Auth settings updated',
+        content: {
+          'application/json': {
+            schema: AuthSettingsResponseSchema,
+          },
+        },
+      },
+      ...commonGetErrorResponses,
+    },
+  }),
+  async (c) => {
+    const { tenantId, projectId, appId } = c.req.valid('param');
+    const { allowAnonymous } = c.req.valid('json');
+
+    const appRecord = await getAppAuthKeysForProject(runDbClient)({
+      scopes: { tenantId, projectId },
+      id: appId,
+    });
+
+    if (!appRecord) {
+      throw createApiError({ code: 'not_found', message: 'App not found' });
+    }
+
+    if (appRecord.config.type !== 'web_client') {
+      throw createApiError({
+        code: 'bad_request',
+        message: 'Auth settings are only supported for web_client apps',
+      });
+    }
+
+    const existingAuth = appRecord.config.webClient.auth;
+    const updatedAuth = {
+      ...existingAuth,
+      publicKeys: existingAuth?.publicKeys ?? [],
+      allowAnonymous,
+    };
+
+    await updateAppAuthKeysForProject(runDbClient)({
+      scopes: { tenantId, projectId },
+      id: appId,
+      config: {
+        type: 'web_client',
+        webClient: {
+          ...appRecord.config.webClient,
+          auth: updatedAuth,
+        },
+      },
+    });
+
+    return c.json({ data: { allowAnonymous } });
+  }
+);
+
 export default app;
diff --git a/agents-docs/content/api-reference/(openapi)/apps.mdx b/agents-docs/content/api-reference/(openapi)/apps.mdx
index 5f327a94d..84b7fe697 100644
--- a/agents-docs/content/api-reference/(openapi)/apps.mdx
+++ b/agents-docs/content/api-reference/(openapi)/apps.mdx
@@ -17,6 +17,9 @@ _openapi:
     - depth: 2
       title: Add Public Key
       url: '#add-public-key'
+    - depth: 2
+      title: Update Auth Settings
+      url: '#update-auth-settings'
     - depth: 2
       title: Delete Public Key
       url: '#delete-public-key'
@@ -39,6 +42,8 @@ _openapi:
         id: list-public-keys
       - content: Add Public Key
         id: add-public-key
+      - content: Update Auth Settings
+        id: update-auth-settings
       - content: Delete Public Key
         id: delete-public-key
       - content: Get App
@@ -56,6 +61,8 @@ _openapi:
         heading: list-public-keys
       - content: Add a public key for app authentication
         heading: add-public-key
+      - content: Update authentication settings for a web client app
+        heading: update-auth-settings
       - content: Remove a public key by kid
         heading: delete-public-key
       - content: Get a specific app credential by ID
@@ -68,4 +75,4 @@ _openapi:
 
 {/* This file was generated by Fumadocs. Do not edit this file directly. Any changes should be made by running the generation command again. */}
 
-<APIPage document={"index"} webhooks={[]} operations={[{"path":"/manage/tenants/{tenantId}/projects/{projectId}/apps","method":"get"},{"path":"/manage/tenants/{tenantId}/projects/{projectId}/apps","method":"post"},{"path":"/manage/tenants/{tenantId}/projects/{projectId}/apps/{appId}/auth/keys","method":"get"},{"path":"/manage/tenants/{tenantId}/projects/{projectId}/apps/{appId}/auth/keys","method":"post"},{"path":"/manage/tenants/{tenantId}/projects/{projectId}/apps/{appId}/auth/keys/{kid}","method":"delete"},{"path":"/manage/tenants/{tenantId}/projects/{projectId}/apps/{id}","method":"get"},{"path":"/manage/tenants/{tenantId}/projects/{projectId}/apps/{id}","method":"patch"},{"path":"/manage/tenants/{tenantId}/projects/{projectId}/apps/{id}","method":"delete"}]} showTitle={true} />
\ No newline at end of file
+<APIPage document={"index"} webhooks={[]} operations={[{"path":"/manage/tenants/{tenantId}/projects/{projectId}/apps","method":"get"},{"path":"/manage/tenants/{tenantId}/projects/{projectId}/apps","method":"post"},{"path":"/manage/tenants/{tenantId}/projects/{projectId}/apps/{appId}/auth/keys","method":"get"},{"path":"/manage/tenants/{tenantId}/projects/{projectId}/apps/{appId}/auth/keys","method":"post"},{"path":"/manage/tenants/{tenantId}/projects/{projectId}/apps/{appId}/auth/keys/settings","method":"patch"},{"path":"/manage/tenants/{tenantId}/projects/{projectId}/apps/{appId}/auth/keys/{kid}","method":"delete"},{"path":"/manage/tenants/{tenantId}/projects/{projectId}/apps/{id}","method":"get"},{"path":"/manage/tenants/{tenantId}/projects/{projectId}/apps/{id}","method":"patch"},{"path":"/manage/tenants/{tenantId}/projects/{projectId}/apps/{id}","method":"delete"}]} showTitle={true} />
\ No newline at end of file
diff --git a/agents-docs/content/talk-to-your-agents/(chat-components)/app-credentials.mdx b/agents-docs/content/talk-to-your-agents/(chat-components)/app-credentials.mdx
index 5a09cb746..76f77b264 100644
--- a/agents-docs/content/talk-to-your-agents/(chat-components)/app-credentials.mdx
+++ b/agents-docs/content/talk-to-your-agents/(chat-components)/app-credentials.mdx
@@ -103,9 +103,13 @@ In addition to anonymous sessions, apps can be configured for **authenticated ch
   RSA keys must be at least 2048 bits. Private keys are rejected at upload time — only public keys are accepted.
 </Note>
 
-### Dual-mode support
+### Enforcing authentication
 
-Apps with auth keys still serve **anonymous sessions by default**. If a signed JWT verification fails, the request falls back to anonymous authentication. To require authenticated sessions only, set `allowAnonymous` to `false` in the app's auth configuration.
+Apps with auth keys still serve **anonymous sessions by default**. If a signed JWT verification fails, the request falls back to anonymous authentication.
+
+To require authenticated sessions only, enable **Require Authentication** in the app's auth settings. This toggle appears in the app edit dialog once at least one public key is added. When enabled, requests without a valid signed JWT are rejected with a `401 Unauthorized` response instead of falling back to anonymous.
+
+You can also set this via the API by calling `PATCH /manage/tenants/{tenantId}/projects/{projectId}/apps/{appId}/auth/keys/settings` with `{ "allowAnonymous": false }`.
 
 ### Verified claims
 
@@ -131,6 +135,8 @@ From here you can add, view, copy, and delete public keys. Each key requires:
   You can register multiple public keys per app. Use this for key rotation — upload a new key before retiring the old one.
 </Tip>
 
+Once keys are added, a **Require Authentication** toggle appears. Enable it to block anonymous access and require all users to present a valid signed JWT.
+
 Below the keys section, the **Audience (aud)** field lets you require that signed JWTs include a matching `aud` claim. When set, tokens without a matching audience are rejected.
 
 ## Security Model
@@ -142,7 +148,7 @@ Below the keys section, the **Audience (aud)** field lets you require that signe
 | **Captcha** | Proof-of-Work challenges prevent automated abuse |
 | **Anonymous identities** | Each anonymous session gets a unique user ID for per-user conversation history |
 | **Authenticated identities** | User ID from verified `sub` claim when using signed JWTs |
-| **Dual-mode** | Apps can support both anonymous and authenticated sessions |
+| **Dual-mode** | Apps support both anonymous and authenticated sessions; toggle **Require Authentication** to enforce authenticated-only access |
 | **Token expiry** | Anonymous session tokens default to 30 days; authenticated tokens max 24 hours |
 | **Rolling refresh** | Include existing anonymous token when requesting a new session to preserve identity with a fresh expiry |
 | **Verified claims** | Non-standard JWT claims from authenticated sessions available in conversation context |
diff --git a/agents-manage-ui/src/components/apps/auth-keys-section.tsx b/agents-manage-ui/src/components/apps/auth-keys-section.tsx
index 46e684b93..45ac02610 100644
--- a/agents-manage-ui/src/components/apps/auth-keys-section.tsx
+++ b/agents-manage-ui/src/components/apps/auth-keys-section.tsx
@@ -14,12 +14,14 @@ import {
   SelectTrigger,
   SelectValue,
 } from '@/components/ui/select';
+import { Switch } from '@/components/ui/switch';
 import { Textarea } from '@/components/ui/textarea';
 import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
 import {
   addAppAuthKeyAction,
   deleteAppAuthKeyAction,
   fetchAppAuthKeysAction,
+  updateAppAuthSettingsAction,
 } from '@/lib/actions/app-auth-keys';
 import type { PublicKeyConfig } from '@/lib/api/app-auth-keys';
 
@@ -33,14 +35,22 @@ interface AuthKeysSectionProps {
   tenantId: string;
   projectId: string;
   appId: string;
+  allowAnonymous?: boolean;
 }
 
-export function AuthKeysSection({ tenantId, projectId, appId }: AuthKeysSectionProps) {
+export function AuthKeysSection({
+  tenantId,
+  projectId,
+  appId,
+  allowAnonymous,
+}: AuthKeysSectionProps) {
   const [keys, setKeys] = useState<PublicKeyConfig[]>([]);
   const [isLoading, setIsLoading] = useState(true);
   const [showAddForm, setShowAddForm] = useState(false);
   const [isAdding, setIsAdding] = useState(false);
   const [deletingKid, setDeletingKid] = useState<string | null>(null);
+  const [requireAuth, setRequireAuth] = useState(allowAnonymous === false);
+  const [isUpdatingAuth, setIsUpdatingAuth] = useState(false);
 
   const [kid, setKid] = useState('');
   const [algorithm, setAlgorithm] = useState('RS256');
@@ -99,6 +109,27 @@ export function AuthKeysSection({ tenantId, projectId, appId }: AuthKeysSectionP
     }
   };
 
+  const handleToggleRequireAuth = async (checked: boolean) => {
+    setRequireAuth(checked);
+    setIsUpdatingAuth(true);
+    try {
+      const result = await updateAppAuthSettingsAction(tenantId, projectId, appId, !checked);
+      if (result.success) {
+        toast.success(
+          checked ? 'Authentication required for all users' : 'Anonymous access allowed'
+        );
+      } else {
+        setRequireAuth(!checked);
+        toast.error(result.error || 'Failed to update auth settings');
+      }
+    } catch {
+      setRequireAuth(!checked);
+      toast.error('Failed to update auth settings');
+    } finally {
+      setIsUpdatingAuth(false);
+    }
+  };
+
   if (isLoading) {
     return (
       <div className="space-y-2">
@@ -176,6 +207,23 @@ export function AuthKeysSection({ tenantId, projectId, appId }: AuthKeysSectionP
         </TooltipProvider>
       )}
 
+      {keys.length > 0 && (
+        <div className="flex items-center justify-between rounded-md border p-3">
+          <div className="space-y-0.5">
+            <Label className="text-sm">Require Authentication</Label>
+            <p className="text-xs text-muted-foreground">
+              When enabled, all users must present a valid signed JWT. Anonymous access is blocked.
+            </p>
+          </div>
+          <Switch
+            checked={requireAuth}
+            onCheckedChange={handleToggleRequireAuth}
+            disabled={isUpdatingAuth}
+            aria-label="Require authentication"
+          />
+        </div>
+      )}
+
       {showAddForm && (
         <div className="space-y-3 rounded-md border p-3">
           <div className="space-y-1.5">
diff --git a/agents-manage-ui/src/components/apps/form/app-update-form.tsx b/agents-manage-ui/src/components/apps/form/app-update-form.tsx
index e6a542660..28d2e90db 100644
--- a/agents-manage-ui/src/components/apps/form/app-update-form.tsx
+++ b/agents-manage-ui/src/components/apps/form/app-update-form.tsx
@@ -28,6 +28,7 @@ interface WebClientConfigShape {
   allowedDomains?: string[];
   auth?: {
     audience?: string;
+    allowAnonymous?: boolean;
   };
 }
 
@@ -83,8 +84,13 @@ export function AppUpdateForm({
         };
 
         if (data.audience !== undefined) {
+          const {
+            allowAnonymous: _,
+            publicKeys: __,
+            ...restAuth
+          } = (webConfig?.auth as Record<string, unknown>) ?? {};
           webClientConfig.auth = {
-            ...((webConfig?.auth as Record<string, unknown>) ?? {}),
+            ...restAuth,
             audience: data.audience.trim() || undefined,
           };
         }
@@ -169,7 +175,12 @@ export function AppUpdateForm({
         {app.type === 'web_client' && (
           <>
             <Separator />
-            <AuthKeysSection tenantId={tenantId} projectId={projectId} appId={app.id} />
+            <AuthKeysSection
+              tenantId={tenantId}
+              projectId={projectId}
+              appId={app.id}
+              allowAnonymous={webConfig?.auth?.allowAnonymous}
+            />
             <GenericInput
               control={form.control}
               name="audience"
diff --git a/agents-manage-ui/src/components/form/__tests__/__screenshots__/form.browser.test.tsx/Form-should-properly-highlight-nested-error-state-1.png b/agents-manage-ui/src/components/form/__tests__/__screenshots__/form.browser.test.tsx/Form-should-properly-highlight-nested-error-state-1.png
new file mode 100644
index 000000000..cd4bb4b29
Binary files /dev/null and b/agents-manage-ui/src/components/form/__tests__/__screenshots__/form.browser.test.tsx/Form-should-properly-highlight-nested-error-state-1.png differ
diff --git a/agents-manage-ui/src/lib/actions/app-auth-keys.ts b/agents-manage-ui/src/lib/actions/app-auth-keys.ts
index 365eb9a38..aaba609bf 100644
--- a/agents-manage-ui/src/lib/actions/app-auth-keys.ts
+++ b/agents-manage-ui/src/lib/actions/app-auth-keys.ts
@@ -6,6 +6,7 @@ import {
   deleteAppAuthKey,
   fetchAppAuthKeys,
   type PublicKeyConfig,
+  updateAppAuthSettings,
 } from '../api/app-auth-keys';
 import { ApiError } from '../types/errors';
 import type { ActionResult } from './types';
@@ -52,6 +53,28 @@ export async function addAppAuthKeyAction(
   }
 }
 
+export async function updateAppAuthSettingsAction(
+  tenantId: string,
+  projectId: string,
+  appId: string,
+  allowAnonymous: boolean
+): Promise<ActionResult<void>> {
+  try {
+    await updateAppAuthSettings(tenantId, projectId, appId, { allowAnonymous });
+    revalidatePath(`/${tenantId}/projects/${projectId}/apps`);
+    return { success: true };
+  } catch (error) {
+    if (error instanceof ApiError) {
+      return { success: false, error: error.message, code: error.error.code };
+    }
+    return {
+      success: false,
+      error: error instanceof Error ? error.message : 'Unknown error occurred',
+      code: 'unknown_error',
+    };
+  }
+}
+
 export async function deleteAppAuthKeyAction(
   tenantId: string,
   projectId: string,
diff --git a/agents-manage-ui/src/lib/api/app-auth-keys.ts b/agents-manage-ui/src/lib/api/app-auth-keys.ts
index eed3366b4..2eec46f1f 100644
--- a/agents-manage-ui/src/lib/api/app-auth-keys.ts
+++ b/agents-manage-ui/src/lib/api/app-auth-keys.ts
@@ -38,6 +38,21 @@ export async function addAppAuthKey(
   return response.data;
 }
 
+export async function updateAppAuthSettings(
+  tenantId: string,
+  projectId: string,
+  appId: string,
+  body: { allowAnonymous: boolean }
+): Promise<void> {
+  await makeManagementApiRequest(
+    `tenants/${tenantId}/projects/${projectId}/apps/${appId}/auth/keys/settings`,
+    {
+      method: 'PATCH',
+      body: JSON.stringify(body),
+    }
+  );
+}
+
 export async function deleteAppAuthKey(
   tenantId: string,
   projectId: string,
diff --git a/specs/enforce-app-auth/SPEC.md b/specs/enforce-app-auth/SPEC.md
new file mode 100644
index 000000000..26ebfbdc1
--- /dev/null
+++ b/specs/enforce-app-auth/SPEC.md
@@ -0,0 +1,124 @@
+# SPEC: Enforce Authentication for App Access
+
+## Problem Statement
+
+Web client apps currently support asymmetric JWT authentication via public key configuration. When authentication keys are configured, the `allowAnonymous` flag controls whether users without a valid JWT can still access the app anonymously. However:
+
+1. **No UI control exists** for the `allowAnonymous` setting — it defaults to `true` implicitly (via `allowAnonymous !== false` in `runAuth.ts:632`), meaning all apps allow anonymous access even when auth keys are configured.
+2. **Builders have no way** to enforce that all app users must present a valid JWT — a critical requirement for apps handling sensitive data or requiring user identity.
+
+The `allowAnonymous` field already exists in `WebClientAuthConfigSchema` and the runtime enforcement logic works correctly in `runAuth.ts`. This feature surfaces that control in the UI and ensures the datamodel is explicit.
+
+## Goals
+
+- Allow app builders to toggle "Require Authentication" for web client apps in the manage UI
+- When enabled, anonymous access is blocked — only users with valid JWTs can access the app
+- The toggle should only be available when at least one public key is configured (you can't require auth without keys to verify against)
+- Persist the setting via the existing `allowAnonymous` field in `app.config.webClient.auth`
+
+## Non-Goals
+
+- Changing the runtime auth enforcement logic (it already works correctly)
+- Adding new API endpoints (the existing app update endpoint accepts config changes)
+- Modifying the `allowAnonymous` default behavior for existing apps (backward compatible)
+- Adding auth enforcement for `api` type apps (out of scope)
+
+## Technical Design
+
+### Data Model
+
+The `allowAnonymous` field already exists in `WebClientAuthConfigSchema` (`packages/agents-core/src/validation/schemas.ts:1944`):
+
+```typescript
+export const WebClientAuthConfigSchema = z.object({
+  publicKeys: z.array(PublicKeyConfigSchema).default([]),
+  audience: z.string().optional(),
+  validateScopeClaims: z.boolean().optional(),
+  allowAnonymous: z.boolean().optional(), // already exists
+});
+```
+
+**No schema changes needed.** The field is optional and defaults to `true` when not set (via `!== false` check in runtime). Setting it to `false` enforces authentication.
+
+### API Layer
+
+The existing `PATCH /tenants/{tenantId}/projects/{projectId}/apps/{id}` endpoint already accepts `config` in the body via `AppApiUpdateSchema`. The UI will send the `allowAnonymous` value as part of the `config.webClient.auth` object, merged with existing auth config (preserving `publicKeys`, `audience`, etc.).
+
+**No API changes needed.**
+
+### UI Changes
+
+#### 1. Auth Keys Section Enhancement (`agents-manage-ui/src/components/apps/auth-keys-section.tsx`)
+
+Add a "Require Authentication" toggle to the `AuthKeysSection` component. This toggle:
+
+- **Appears only when keys are configured** (keys.length > 0)
+- **Reads initial state** from the app's `config.webClient.auth.allowAnonymous` field
+- **Updates via a new server action** that PATCHes the app config with `allowAnonymous: true/false`
+- **UI pattern**: Switch component (matching the existing "Enabled" toggle pattern in `app-update-form.tsx:128-138`)
+- **Label**: "Require Authentication"
+- **Description**: "When enabled, all users must present a valid signed JWT. Anonymous access is blocked."
+- **Position**: Between the key list and the "Add Key" button area, visible only when keys exist
+
+#### 2. Server Action (`agents-manage-ui/src/lib/actions/app-auth-keys.ts`)
+
+Add a new server action `updateAppAuthSettingsAction` that:
+- Takes `tenantId`, `projectId`, `appId`, and `allowAnonymous: boolean`
+- Calls the existing app update API with the merged config
+- Revalidates the apps path
+
+#### 3. Data Flow
+
+The `AuthKeysSection` component currently manages its own state independently from the parent form. The `allowAnonymous` toggle follows this same pattern — it updates immediately via server action (not through the parent form submit), matching how key add/delete already works.
+
+To read the initial `allowAnonymous` value, the component needs access to the current auth config. Options:
+- **Option A**: Pass `allowAnonymous` as a prop from the parent form (which already has `webConfig`)
+- **Option B**: Fetch it alongside keys from a new or existing endpoint
+
+**Decision: Option A** — simpler, no new endpoints, parent already has the data.
+
+### Runtime Enforcement (No Changes)
+
+The existing logic in `runAuth.ts:631-645` already handles this correctly:
+
+```typescript
+if (!asymResult.ok) {
+  const allowAnonymous = config.webClient.auth?.allowAnonymous !== false;
+  if (!allowAnonymous) {
+    throw createApiError({ code: 'unauthorized', message: asymResult.failureMessage });
+  }
+  // Fall through to anonymous path
+}
+```
+
+## Acceptance Criteria
+
+1. **Toggle visible when keys configured**: When a web client app has at least one public key, a "Require Authentication" switch appears in the auth section
+2. **Toggle hidden when no keys**: When no public keys are configured, the toggle is not shown
+3. **Toggle reflects current state**: The switch reflects the current `allowAnonymous` value from the app config (off = allowAnonymous true/undefined, on = allowAnonymous false)
+4. **Toggle persists on change**: Toggling the switch immediately saves the setting via server action and shows a success toast
+5. **Backward compatible**: Apps without `allowAnonymous` set continue to allow anonymous access (existing behavior unchanged)
+6. **Runtime enforcement works**: When `allowAnonymous` is `false` and a request comes in with an invalid/missing JWT, the API returns 401
+
+## Test Cases
+
+1. **Unit test**: `AuthKeysSection` renders the toggle only when keys are present
+2. **Unit test**: Toggle state reflects the `allowAnonymous` prop value
+3. **Unit test**: Toggling calls the server action with correct parameters
+4. **Integration test**: App update API correctly persists `allowAnonymous` in config JSONB
+5. **Integration test**: Runtime auth correctly blocks anonymous access when `allowAnonymous: false`
+
+## Files to Modify
+
+| File | Change |
+|------|--------|
+| `agents-manage-ui/src/components/apps/auth-keys-section.tsx` | Add Require Authentication toggle |
+| `agents-manage-ui/src/components/apps/form/app-update-form.tsx` | Pass `allowAnonymous` prop to AuthKeysSection |
+| `agents-manage-ui/src/lib/actions/app-auth-keys.ts` | Add `updateAppAuthSettingsAction` server action |
+| `agents-manage-ui/src/lib/api/app-auth-keys.ts` | Add API call for updating auth settings (if needed) |
+
+## Risk Assessment
+
+- **Low risk**: No schema migration needed, no API changes, runtime logic unchanged
+- **UI-only change** with server action that uses existing update endpoint
+- **Backward compatible**: Optional field, existing apps unaffected
```

## Changes Since Last Review

_N/A — local review (no prior GitHub review baseline)._

## Prior Feedback

> **IMPORTANT:** Local review mode does not load prior PR threads or prior review summaries. Treat this as a first-pass review of the current local changes unless the invoker provided additional context elsewhere.

### Automated Review Comments

_None (local review)._

### Human Review Comments

_None (local review)._

### Previous Review Summaries

_None (local review)._

### PR Discussion

_None (local review)._

## GitHub URL Base (for hyperlinks)

No GitHub PR context is available in local review mode.
- For in-repo citations, use repo-relative `path:line` or `path:start-end` references instead of GitHub blob URLs.
- External docs may still use standard markdown hyperlinks.
