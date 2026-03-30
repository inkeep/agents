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
| **Head SHA** | `a18f2cef7e7c63038d9d6fcefd996b9570d136b4` |
| **Size** | 2 commits · +414/-5 · 9 files (1 untracked) |
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
803777f84 Add Require Authentication toggle for web client apps
a18f2cef7 Update app credentials docs with Require Authentication toggle
```

## Changed Files

Per-file diff stats (for prioritizing review effort). Untracked files are listed below but are not converted into synthetic patch text by this generator:

```
 agents-api/__snapshots__/openapi.json              | 130 +++++++++++++++++++++
 .../manage/routes/crud/appAuthKeys.test.ts         | 104 +++++++++++++++++
 .../src/domains/manage/routes/appAuthKeys.ts       |  77 ++++++++++++
 .../(chat-components)/app-credentials.mdx          |  12 +-
 .../src/components/apps/auth-keys-section.tsx      |  50 +++++++-
 .../src/components/apps/form/app-update-form.tsx   |   8 +-
 agents-manage-ui/src/lib/actions/app-auth-keys.ts  |  23 ++++
 agents-manage-ui/src/lib/api/app-auth-keys.ts      |  15 +++
 8 files changed, 414 insertions(+), 5 deletions(-)
new file | specs/enforce-app-auth/SPEC.md
```

Full file list (including untracked files when present):

```
agents-api/__snapshots__/openapi.json
agents-api/src/__tests__/manage/routes/crud/appAuthKeys.test.ts
agents-api/src/domains/manage/routes/appAuthKeys.ts
agents-docs/content/talk-to-your-agents/(chat-components)/app-credentials.mdx
agents-manage-ui/src/components/apps/auth-keys-section.tsx
agents-manage-ui/src/components/apps/form/app-update-form.tsx
agents-manage-ui/src/lib/actions/app-auth-keys.ts
agents-manage-ui/src/lib/api/app-auth-keys.ts
specs/enforce-app-auth/SPEC.md
```

## Diff

```diff
diff --git a/agents-api/__snapshots__/openapi.json b/agents-api/__snapshots__/openapi.json
index 0846d683d..24a8faa0d 100644
--- a/agents-api/__snapshots__/openapi.json
+++ b/agents-api/__snapshots__/openapi.json
@@ -10547,6 +10547,18 @@
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
@@ -26069,6 +26081,124 @@
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
index f5811ed09..3087f6f46 100644
--- a/agents-api/src/__tests__/manage/routes/crud/appAuthKeys.test.ts
+++ b/agents-api/src/__tests__/manage/routes/crud/appAuthKeys.test.ts
@@ -191,6 +191,110 @@ describe('App Auth Keys Routes', () => {
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
+
+      const listRes = await makeRequest(keysUrl(tenantId, projectId, app.id));
+      const body = await listRes.json();
+      expect(body.data).toEqual([]);
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
index 13b5712cb..f34907b4b 100644
--- a/agents-api/src/domains/manage/routes/appAuthKeys.ts
+++ b/agents-api/src/domains/manage/routes/appAuthKeys.ts
@@ -240,4 +240,81 @@ app.openapi(
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
+    return c.json({ success: true });
+  }
+);
+
 export default app;
diff --git a/agents-docs/content/talk-to-your-agents/(chat-components)/app-credentials.mdx b/agents-docs/content/talk-to-your-agents/(chat-components)/app-credentials.mdx
index 5a09cb746..02b8c5a31 100644
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
+You can also set this via the API by setting `allowAnonymous` to `false` in the app's auth configuration.
 
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
index e6a542660..cb227011b 100644
--- a/agents-manage-ui/src/components/apps/form/app-update-form.tsx
+++ b/agents-manage-ui/src/components/apps/form/app-update-form.tsx
@@ -28,6 +28,7 @@ interface WebClientConfigShape {
   allowedDomains?: string[];
   auth?: {
     audience?: string;
+    allowAnonymous?: boolean;
   };
 }
 
@@ -169,7 +170,12 @@ export function AppUpdateForm({
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
```

> **Note:** 1 untracked file(s) are listed above. Review them directly in the working tree if they are relevant.

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
