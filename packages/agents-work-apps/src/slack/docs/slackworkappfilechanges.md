# Slack Work App PR - File Changes Summary

**Branch:** `feat/inkeep-slack-app-v2`
**Compared to:** `origin/main`

> **Note:** This file was auto-generated during development. Some details may be outdated.

---

## Summary

| Category | Added | Modified | Deleted | Total |
|----------|-------|----------|---------|-------|
| Backend (API) | 2 | 11 | 0 | 13 |
| Backend (Work Apps Package) | 47 | 3 | 0 | 50 |
| Backend (Core Package) | 13 | 9 | 0 | 22 |
| Frontend (Manage UI) | 23 | 5 | 0 | 28 |
| Database (Migrations) | 6 | 2 | 0 | 8 |
| Documentation | 9 | 1 | 0 | 10 |
| Config/Other | 0 | 2 | 0 | 2 |
| **Total** | **100** | **33** | **0** | **133** |

---

## 1. Backend - API (`agents-api/`)

### Added (2 files)
| File | Purpose |
|------|---------|
| `src/domains/work-apps/index.ts` | Work apps domain entry point - mounts Slack routes |
| `src/domains/work-apps/types.ts` | Type definitions for work apps domain |

### Modified (11 files)
| File | Purpose |
|------|---------|
| `__snapshots__/openapi.json` | Updated OpenAPI spec with new Slack endpoints |
| `package.json` | Added `@inkeep/agents-work-apps` dependency |
| `src/createApp.ts` | Mount work-apps routes at `/work-apps/slack` |
| `src/domains/evals/services/EvaluationService.ts` | Minor update (unrelated) |
| `src/middleware/cors.ts` | Allow Slack-related origins |
| `src/middleware/index.ts` | Export new auth types |
| `src/middleware/manageAuth.ts` | Handle `slackUserToken` JWT verification |
| `src/middleware/runAuth.ts` | Handle Slack JWT in run API |
| `src/openapi.ts` | Register Slack OpenAPI specs |
| `vite.config.ts` | Build config update |

---

## 2. Backend - Work Apps Package (`packages/agents-work-apps/src/slack/`)

### Added - Routes (7 files)
| File | Purpose |
|------|---------|
| `routes/index.ts` | Main router composition |
| `routes/events.ts` | Slash commands, events, Nango webhooks |
| `routes/oauth.ts` | OAuth install flow |
| `routes/users.ts` | User linking, settings, disconnect |
| `routes/workspaces.ts` | Workspace management, channel configs |
| `routes/resources.ts` | Projects/agents listing |
| `routes/internal.ts` | Debug endpoints |

### Added - Services (20 files)
| File | Purpose |
|------|---------|
| `services/index.ts` | Barrel exports |
| `services/nango.ts` | Nango OAuth token management |
| `services/auth/index.ts` | JWT generation & API execution |
| `services/commands/index.ts` | Slash command handlers |
| `services/events/index.ts` | Event handlers barrel |
| `services/events/app-mention.ts` | @mention handling |
| `services/events/streaming.ts` | Stream responses to Slack |
| `services/events/block-actions.ts` | Button/action handling |
| `services/events/modal-submission.ts` | Modal form handling |
| `services/events/utils.ts` | Event utilities |
| `services/blocks/index.ts` | Block Kit message builders |
| `services/agent-resolution.ts` | Channel > Workspace priority |
| `services/api-client.ts` | Internal API client |
| `services/client.ts` | Slack Web API wrapper |
| `services/security.ts` | Request signature verification |
| `services/modals.ts` | Modal builders |
| `services/workspace-tokens.ts` | Token cache |
| `services/types.ts` | Service type definitions |

### Added - Tests (8 files)
| File | Purpose |
|------|---------|
| `__tests__/routes.test.ts` | Route integration tests |
| `services/__tests__/agent-resolution.test.ts` | Agent resolution tests |
| `services/__tests__/api-client.test.ts` | API client tests |
| `services/__tests__/blocks.test.ts` | Block Kit tests |
| `services/__tests__/client.test.ts` | Slack client tests |
| `services/__tests__/commands.test.ts` | Command handler tests |
| `services/__tests__/events.test.ts` | Event handler tests |
| `services/__tests__/nango.test.ts` | Nango service tests |
| `services/__tests__/security.test.ts` | Security tests |

### Added - Other (12 files)
| File | Purpose |
|------|---------|
| `index.ts` | Package entry point |
| `routes.ts` | Routes re-export |
| `types.ts` | Slack types |
| `middleware/permissions.ts` | Permission checks |
| `slack-app-manifest.json` | Slack app configuration |
| `README.md` | Package documentation |
| `docs/INDEX.md` | Documentation index |
| `docs/spec/ARCHITECTURE.md` | Architecture overview |
| `docs/spec/AUTHENTICATION.md` | Auth flow docs |
| `docs/spec/API.md` | API reference |
| `docs/spec/DATABASE.md` | Database schema docs |
| `docs/spec/DESIGN_DECISIONS.md` | Design rationale |
| `docs/flows/SLASH_COMMANDS.md` | Command flow docs |
| `docs/flows/MENTIONS.md` | Mention flow docs |
| `docs/flows/USER_FLOWS.md` | User journey docs |
| `docs/developer/COMMANDS.md` | Command reference |
| `docs/developer/TESTING.md` | Testing guide |

### Modified (3 files)
| File | Purpose |
|------|---------|
| `package.json` | Added Slack dependencies |
| `src/db/index.ts` | Export DB clients |
| `src/env.ts` | Added Slack env vars |

---

## 3. Backend - Core Package (`packages/agents-core/`)

### Added - Data Access (3 files)
| File | Purpose |
|------|---------|
| `src/data-access/runtime/workAppSlack.ts` | 26 CRUD functions for Slack tables |
| `src/data-access/manage/workAppConfigs.ts` | Generic work app config (future use) |
| `src/data-access/__tests__/workAppSlack.test.ts` | Data access tests |

### Added - Utils (3 files)
| File | Purpose |
|------|---------|
| `src/utils/slack-user-token.ts` | Sign/verify SlackUserToken JWT |
| `src/utils/slack-link-token.ts` | Sign/verify SlackLinkToken JWT |
| `src/utils/sse-parser.ts` | SSE response parser |

### Added - Tests (2 files)
| File | Purpose |
|------|---------|
| `src/__tests__/utils/slack-user-token.test.ts` | JWT tests |
| `src/__tests__/utils/slack-link-token.test.ts` | Link token tests |

### Added - Other (1 file)
| File | Purpose |
|------|---------|
| `src/auth/create-test-users.ts` | Test user creation helper |

### Modified (9 files)
| File | Purpose |
|------|---------|
| `src/db/runtime/runtime-schema.ts` | Added 4 Slack tables |
| `src/db/manage/manage-schema.ts` | Added workAppConfigs table |
| `src/data-access/index.ts` | Export new data access functions |
| `src/types/entities.ts` | Added Slack entity types |
| `src/utils/index.ts` | Export new utils |
| `src/validation/schemas.ts` | Added Zod schemas for Slack tables |

---

## 4. Database - Migrations

### Runtime DB (PostgreSQL)
| File | Purpose |
|------|---------|
| `drizzle/runtime/0011_grey_energizer.sql` | Add Slack tables |
| `drizzle/runtime/0012_salty_zuras.sql` | Change enabled varchar→boolean |
| `drizzle/runtime/meta/0011_snapshot.json` | Migration metadata |
| `drizzle/runtime/meta/0012_snapshot.json` | Migration metadata |
| `drizzle/runtime/meta/_journal.json` | Migration journal (modified) |

### Manage DB (Doltgres)
| File | Purpose |
|------|---------|
| `drizzle/manage/0007_whole_skreet.sql` | Add workAppConfigs table |
| `drizzle/manage/meta/0007_snapshot.json` | Migration metadata |
| `drizzle/manage/meta/_journal.json` | Migration journal (modified) |

---

## 5. Frontend - Manage UI (`agents-manage-ui/`)

### Added - Pages (2 files)
| File | Purpose |
|------|---------|
| `src/app/[tenantId]/work-apps/slack/page.tsx` | Slack dashboard page |
| `src/app/link/page.tsx` | User linking page |

### Added - Components (9 files)
| File | Purpose |
|------|---------|
| `src/features/work-apps/slack/components/index.ts` | Barrel exports |
| `src/features/work-apps/slack/components/slack-dashboard.tsx` | Main dashboard |
| `src/features/work-apps/slack/components/workspace-hero.tsx` | Workspace header |
| `src/features/work-apps/slack/components/agent-configuration-card.tsx` | Agent config UI |
| `src/features/work-apps/slack/components/linked-users-section.tsx` | Linked users list |
| `src/features/work-apps/slack/components/notification-banner.tsx` | Status banners |
| `src/features/work-apps/common/components/index.ts` | Common components |
| `src/features/work-apps/common/components/work-app-card.tsx` | App card component |
| `src/features/work-apps/common/components/work-app-icon.tsx` | App icon component |
| `src/features/work-apps/common/components/work-apps-overview.tsx` | Overview component |

### Added - API/Data (6 files)
| File | Purpose |
|------|---------|
| `src/features/work-apps/slack/api/index.ts` | API exports |
| `src/features/work-apps/slack/api/queries.ts` | React Query hooks |
| `src/features/work-apps/slack/api/slack-api.ts` | API client |
| `src/features/work-apps/slack/actions/agents.ts` | Server actions |
| `src/features/work-apps/slack/db/index.ts` | Local DB exports |
| `src/features/work-apps/slack/db/local-db.ts` | IndexedDB for offline |
| `src/features/work-apps/slack/db/schema.ts` | Local schema |

### Added - State/Types (6 files)
| File | Purpose |
|------|---------|
| `src/features/work-apps/slack/context/slack-provider.tsx` | React context |
| `src/features/work-apps/slack/store/index.ts` | Store exports |
| `src/features/work-apps/slack/store/slack-store.ts` | Zustand store |
| `src/features/work-apps/slack/hooks/index.ts` | Custom hooks |
| `src/features/work-apps/slack/types/index.ts` | Type definitions |
| `src/features/work-apps/slack/index.ts` | Feature entry |
| `src/features/work-apps/common/types.ts` | Common types |
| `src/features/work-apps/common/index.ts` | Common exports |
| `src/features/work-apps/index.ts` | Work apps entry |

### Modified (5 files)
| File | Purpose |
|------|---------|
| `.env.example` | Added Slack env vars |
| `src/app/[tenantId]/work-apps/page.tsx` | Updated work apps page |
| `src/components/sidebar-nav/app-sidebar.tsx` | Added Slack nav item |
| `src/components/work-apps/work-apps-nav.tsx` | Updated navigation |
| `src/constants/theme.ts` | Theme updates |
| `src/components/agent/configuration/resolve-collisions.ts` | Minor formatting |

---

## 6. Documentation (`agents-docs/`)

### Added (9 files)
| File | Purpose |
|------|---------|
| `content/api-reference/(openapi)/channels.mdx` | Channels API docs |
| `content/api-reference/(openapi)/invitations.mdx` | Invitations API docs |
| `content/api-reference/(openapi)/resources.mdx` | Resources API docs |
| `content/api-reference/(openapi)/slack.mdx` | Slack API docs |
| `content/api-reference/(openapi)/user-organizations.mdx` | User orgs API docs |
| `content/api-reference/(openapi)/users.mdx` | Users API docs |
| `content/api-reference/(openapi)/work-apps.mdx` | Work apps API docs |
| `content/api-reference/(openapi)/workspaces.mdx` | Workspaces API docs |

### Modified (2 files)
| File | Purpose |
|------|---------|
| `content/api-reference/(openapi)/oauth.mdx` | Updated OAuth docs |
| `scripts/generate-openapi-docs.ts` | Doc generation script |

---

## 7. Config/Other

### Modified (2 files)
| File | Purpose |
|------|---------|
| `.env.example` | Added Slack env vars |
| `pnpm-lock.yaml` | Dependency lock file |