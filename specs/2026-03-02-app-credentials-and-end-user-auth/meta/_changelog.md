## 2026-03-02

### Session 1: Intake & World Model

**Context:** User provided a detailed existing proposal for end-user authentication (anonymous sessions, PoW, customer-signed JWT). User wants to evolve this into a broader "App Credentials" system that replaces API keys with polymorphic credentials per app type.

### Evidence Created
- `evidence/current-api-key-system.md` — API key schema, auth middleware, validation flow
- `evidence/spicedb-schema-and-anonymous-users.md` — SpiceDB model + analysis of anonymous principal options
- `evidence/conversation-identity-gaps.md` — userId column exists but never populated
- `evidence/work-apps-as-app-types.md` — How Slack/GitHub map to app credential types

### Key Findings
- API keys are agent-scoped (1 key = 1 agent). App credentials need to be project-scoped with multi-agent access.
- SpiceDB has no anonymous user type. API key auth already bypasses SpiceDB entirely.
- `conversations.userId` exists but is never populated — plumbing ready for per-user history.
- Work apps (Slack, GitHub) have complex configs that shouldn't be flattened into a single polymorphic table.

### Pending (carried forward)
- SPEC.md initial draft — in progress
- Decision batch 1 presented to user — awaiting input

---

## 2026-03-02 (continued)

### Decision Batch 1 — User Responses
- **D6** (project-scoped): Confirmed by user
- **D8** (no anonymous users in SpiceDB): Confirmed — Option C
- **D10** (JSONB with Zod): Confirmed — same as tools pattern

### Deep Investigations Dispatched
- Work app conceptual model — why Slack/GitHub exist as separate systems
- Manage vs runtime DB — design principles and where app credentials fit
- Agent routing — current strict binding, multi-agent patterns (Slack reference), migration needs

### Evidence Created
- `evidence/work-app-conceptual-model.md` — work apps are bidirectional integration layers; overlap with app credentials is in auth/access layers 1-4; layer 5 (platform integration) diverges
- `evidence/manage-vs-runtime-db-analysis.md` — app credentials are deployment/connection state (like API keys, work app installations), not branch-level agent design → runtime DB
- `evidence/agent-routing-multi-agent.md` — current API keys strictly reject header overrides; Slack uses JWT exemption; multi-agent needs allowlist + client-specified agentId

### Key Findings
- Work apps solve discovery + identity linking + platform-native execution. API keys solve static auth. App credentials bridge these at the auth/access layer.
- Doltgres branching is for agent design iteration (prompts, tool configs). App credentials represent real external deployments that don't branch.
- `buildExecutionContext()` actively rejects agentId overrides for regular API keys — this is the specific code that needs to change for multi-agent.
- Triggers are in manage DB but are agent-scoped (part of agent design). App credentials are project-scoped (part of deployment). Different placement is correct.

### Pending (carried forward)
- D7: Work app relationship model — pending user decision
- D11: Runtime DB — pending user confirmation
- D9: Key format
- Migration strategy details
- Widget SDK `appId` semantics

---

## 2026-03-02 (batch 2 decisions)

### Decisions Confirmed
- **D7 → Option C:** Unified for new types only. Slack/GitHub stay as-is for Phase 1.
- **D11 → Runtime DB:** Confirmed. Can migrate to manage DB later if needed.
- **D9 → appId alone for web_client:** No secret for public clients. Captcha + domain restriction as protection.
- **D12 → JSONB allowedAgentIds:** Confirmed.
- **D13 → Dual-read Phase 1 only:** No auto-migration of existing keys.

### Spec Updates
- Section 9 (Proposed Solution) fully built out:
  - Architecture diagram, data model (`apps` table schema)
  - Type-specific config schemas (`WebClientConfig`, `ApiConfig`)
  - App identifier format (`app_<publicId>`, `as_<publicId>.<secret>`)
  - API endpoints (CRUD + anonymous session issuance)
  - Anonymous JWT payload specification
  - Auth middleware integration (new `tryAppCredentialAuth` in priority chain)
  - Conversation userId wiring
  - Widget SDK API
  - Dashboard UI layout
- Section 13 (Phases) — Phase 1 fully scoped with acceptance criteria
- Section 11 (Open Questions) — 5 resolved, 5 new questions surfaced from design
- Decision Log updated with all confirmed decisions

### New Open Questions Surfaced
- Q11: HS256 secret storage location
- Q12: INKEEP_ANON_JWT_SECRET provisioning
- Q13: Wildcard domain support
- Q14: CORS for anonymous session endpoint
- Q15: Empty allowedAgentIds semantics

### Pending (carried forward)
- Q10: Conversation history API design
- Q11-Q15: New questions from design, P0/P1 priority
- Phase 2/3 detailed planning

---

## 2026-03-03 (batch 3 decisions)

### Decisions Confirmed
- **D14:** Agent access uses `agentAccessMode: 'all' | 'selected'` + `allowedAgentIds` when selected. Matches GitHub repo access pattern. Fail-safe default = `selected` with empty array.
- **D15:** CORS keeps `origin: '*'`. Application-level Origin validation is the real enforcement. Both approaches require a DB lookup; keeping `origin: '*'` avoids an extra lookup on preflight.
- **D16:** Conversation history: Run API auto-scopes by JWT `sub`. No userId param. The auth mechanism identifies the user. Manage API gets optional userId filter for admin viewing.
- **Q12 resolved:** INKEEP_ANON_JWT_SECRET rotation via env var redeploy. Dual-key later if needed.
- **Q13 resolved:** Wildcard domains supported (`*.customer.com`). Bare `*` rejected.

### Spec Updates
- Data model: `agentAccessMode` column added (varchar, 'all' | 'selected')
- Auth middleware pseudocode updated to use access mode pattern
- Conversation history section added to proposed solution (Run API auto-scoped, Manage API with userId filter)
- All Q10-Q15 resolved
- Decision Log updated (D14, D15, D16)

### Pending (carried forward)
- Q11: HS256 secret storage (Phase 2, not blocking)
- Phase 1 spec is now complete — ready for quality check or finalization

---

## 2026-03-03 (Better-Auth compatibility investigation)

### Investigation
User asked: "Does our anonymous auth follow the same interface as Better-Auth? Want stateless first, then possibly stateful via Better-Auth."

Dispatched two parallel investigations:
1. Better-Auth session model, token format, auth interface, plugins, programmatic session creation
2. Better-Auth anonymous plugin, session creation API, user requirements

### Key Findings
- Better-Auth tokens are **opaque** (not JWTs), validated via DB lookup
- Better-Auth v1.4.19 has a built-in `anonymous()` plugin: creates user with `isAnonymous: true` + synthetic email, full session lifecycle
- The **transport interface is identical**: `Authorization: Bearer <token>` — widget doesn't know/care if token is JWT or opaque
- The **execution context output** is the same shape regardless of backing
- Account linking is built into the anonymous plugin (solves anon→auth conversation continuity for free)

### Evidence Created
- `evidence/better-auth-anonymous-compatibility.md` — full analysis: interface comparison, strategy pattern for dual validation, migration path, considerations

### Spec Updates
- Section 9: Added "Stateless → Stateful Auth Migration Path" with strategy pattern pseudocode
- Section 15: Added Appendix C (Stateful Anonymous Auth via Better-Auth) as documented deferral
- Renumbered Appendix D → E

### Assessment
The proposed stateless JWT approach is **fully compatible** with a future migration to Better-Auth stateful sessions. The interface contract (Bearer token transport, endpoint URL, execution context shape) is stable. The widget SDK never needs to change. The auth middleware strategy pattern supports both simultaneously during transition.

### Pending (carried forward)
- Q11: HS256 secret storage (Phase 2, not blocking)
- Phase 1 spec is complete — ready for quality check or finalization

---

## 2026-03-03 (Finalization)

### Technical Accuracy Verification
Dispatched parallel verification agents to check 18 technical assertions against the current codebase.

**Confirmed (15 assertions):** runAuth priority chain, SpiceDB bypass, GitHub access mode default, Better-Auth v1.4.19, tools JSONB pattern, `/run/*` CORS, `x-inkeep-agent-id` extraction, `listConversations` userId filter, env.ts Zod pattern, scrypt hashing, PUBLIC_ID_LENGTH=12, conversations composite PK, `buildExecutionContext` strict binding, work app tables location, `isWorkApp` boolean.

**Tier 2 corrections applied:**
1. Anonymous session endpoint path: `/auth/apps/` → `/api/auth/apps/` (reuses existing route mount + CORS)
2. API keys table: noted absence of explicit primaryKey constraint in current state section
3. `createOrGetConversation` userId: refined wording — function accepts userId, callers don't pass it

**Additional cleanup:**
- Fixed remaining `appKey` references in user journeys → `appId`
- Fixed `X-Inkeep-App-Key` header → `X-Inkeep-App-Id`

### Status
- Spec marked as **Final (Phase 1)**
- All P0 open questions resolved
- Remaining open: Q5 (PoW, Phase 2), Q6 (rate limit tiers, Phase 2), Q9 (default app, deferred), Q11 (HS256 storage, Phase 2)
