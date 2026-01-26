---
name: feature-readiness-checklist
description: "Verify if a feature is ready for release by checking tests, UI, docs, linting, and changesets. Use when completing a feature, before creating a PR, or when asked to verify feature readiness. Triggers on: is this ready, feature complete, ready to merge, release checklist, verify feature, pre-PR check."
---

# Feature Readiness Checklist

Systematically verify that a feature meets all release criteria before merging.

---

## The Job

**Purpose:** Ensure features are complete and won't cause issues in production by verifying all mandatory requirements are met.

**When to use:**
- After completing feature implementation
- Before creating a pull request
- When asked "is this ready to merge?" or "can we release this?"
- As a final pre-merge verification

**Steps:**
1. Gather context about what was changed (Step 1)
2. Run automated verification checks (Step 2)
3. Verify manual checklist items (Step 3)
4. Report status and any blockers (Step 4)

---

## Step 1: Gather Context

Ask the user what was changed to determine which checks apply:

```
What type of changes are included in this feature?

1. What packages/areas were modified?
   A. agents-api (backend/API changes)
   B. agents-core (database/schema/types)
   C. agents-manage-ui (frontend/UI changes)
   D. agents-sdk (TypeScript SDK)
   E. agents-docs (documentation)
   F. Other: [please specify]

2. Is this a user-facing change that affects published packages?
   A. Yes - affects how users consume the SDK/API
   B. No - internal refactoring or tooling only

3. Does this include database schema changes?
   A. Yes - new tables, columns, or migrations
   B. No

4. Does this include UI changes?
   A. Yes - new components, pages, or visual changes
   B. No
```

Based on answers, determine which checklist items apply:
- **All changes**: Tests, typecheck, lint, format, build
- **User-facing changes**: Changeset required
- **Schema changes**: Migration verification
- **UI changes**: Browser verification, component tests
- **New features**: Documentation required

---

## Step 2: Automated Verification

Run these checks and report results:

### 2.1 Core Checks (Always Required)

```bash
# Run all checks in sequence to capture all issues
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
pnpm test --run
```

**Interpretation:**
- ✅ Pass: Command exits with code 0
- ❌ Fail: Command exits with non-zero code, report the error output

### 2.2 Schema Checks (If database changes)

```bash
# Verify migrations are up to date
pnpm db:check
```

### 2.3 API Spec Checks (If API route changes)

```bash
# Check if OpenAPI spec needs regeneration
cd agents-api && pnpm export-openapi
git diff --exit-code agents-api/openapi-spec.json
```

If the diff is non-empty, the spec needs to be committed.

---

## Step 3: Manual Verification Checklist

Present this checklist based on the change type:

### All Changes
- [ ] **Tests written**: New code paths have test coverage
- [ ] **Tests passing**: `pnpm test --run` passes
- [ ] **Typecheck passes**: `pnpm typecheck` has no errors
- [ ] **Lint passes**: `pnpm lint` has no errors
- [ ] **Format verified**: `pnpm format:check` passes (run `pnpm format` to fix)
- [ ] **Build passes**: `pnpm build` completes successfully

### User-Facing Changes (Published Packages)
- [ ] **Changeset created**: Run `pnpm bump <patch|minor|major> --pkg <package> "<message>"`
  - Verify changeset file exists in `.changeset/` directory
  - Message follows guidelines: sentence case, action verb, specific about what changed

### Database Schema Changes
- [ ] **Migration generated**: `pnpm db:generate` was run
- [ ] **Migration reviewed**: SQL in `drizzle/` looks correct
- [ ] **Migration applied**: `pnpm db:migrate` succeeds
- [ ] **Schema check passes**: `pnpm db:check` has no drift

### API Route Changes
- [ ] **OpenAPI spec updated**: `pnpm docs:regenerate` was run
- [ ] **Spec committed**: `agents-api/openapi-spec.json` is up to date

### UI Changes
- [ ] **Component implemented**: Changes in `agents-manage-ui/src/components/`
- [ ] **Browser verified**: Manually tested in browser (use dev-browser skill if available)
- [ ] **Component tests added**: Tests in `__tests__/` directories

### New Features
- [ ] **Documentation added**: MDX files in `agents-docs/content/docs/`
- [ ] **Navigation updated**: `meta.json` includes new pages

### Surface Area Review
- [ ] **Breaking changes identified**: Any changes to shared types, APIs, or contracts
- [ ] **Downstream impact assessed**: Considered CLI, SDK, UI, docs implications
- [ ] **User acknowledged**: User is aware of any breaking changes or migration needs

---

## Step 4: Report Status

### Status Report Format

```markdown
## Feature Readiness Report

### Automated Checks
| Check | Status | Notes |
|-------|--------|-------|
| Typecheck | ✅/❌ | [error message if failed] |
| Lint | ✅/❌ | [error message if failed] |
| Format | ✅/❌ | [error message if failed] |
| Build | ✅/❌ | [error message if failed] |
| Tests | ✅/❌ | [X passed, Y failed] |
| Schema | ✅/❌/N/A | [if applicable] |
| OpenAPI Spec | ✅/❌/N/A | [if applicable] |

### Manual Checklist
- [x] Item verified
- [ ] Item needs attention: [what's needed]

### Blockers
[List any issues that must be resolved before merging]

### Recommendations
[Optional improvements or follow-up items]

### Verdict
**Ready to merge:** ✅ Yes / ❌ No - [reason if no]
```

---

## Quick Reference

### Commands to Run

| Check | Command | Fix Command |
|-------|---------|-------------|
| Types | `pnpm typecheck` | Fix type errors manually |
| Lint | `pnpm lint` | `pnpm lint:fix` |
| Format | `pnpm format:check` | `pnpm format` |
| Build | `pnpm build` | Fix build errors manually |
| Tests | `pnpm test --run` | Fix failing tests |
| Schema | `pnpm db:check` | `pnpm db:generate && pnpm db:migrate` |
| API Spec | Check diff after `pnpm docs:regenerate` | Commit the updated spec |

### Changeset Command

```bash
# Single package
pnpm bump patch --pkg agents-core "Fix race condition in message queue"

# Multiple packages
pnpm bump minor --pkg agents-sdk --pkg agents-core "Add streaming response support"
```

### Valid Package Names
`agents-cli`, `agents-core`, `agents-api`, `agents-manage-ui`, `agents-sdk`, `create-agents`, `ai-sdk-provider`

### Semver Guidelines
- **patch**: Bug fixes, additive features, non-breaking changes
- **minor**: Schema changes requiring migration, significant behavior changes
- **major**: Reserved - do not use without explicit approval

---

## Common Issues and Fixes

### "Changeset missing"
```bash
pnpm bump patch --pkg <package> "Description of change"
```

### "Format check failed"
```bash
pnpm format
```

### "OpenAPI spec out of sync"
```bash
pnpm docs:regenerate
git add agents-api/openapi-spec.json
```

### "Schema drift detected"
```bash
pnpm db:generate
# Review the generated migration
pnpm db:migrate
```

### "Tests failing"
1. Run tests with verbose output: `pnpm test --run --reporter=verbose`
2. Run specific test file: `cd <package> && pnpm test --run <file-path>`
3. Fix the failing tests before proceeding

---

## Decision Tree: Is This Ready?

```
All automated checks pass?
├─ No → Fix issues first, re-run checklist
└─ Yes → Continue
    │
    Is this user-facing?
    ├─ Yes → Changeset exists?
    │   ├─ No → Create changeset
    │   └─ Yes → Continue
    └─ No → Continue
        │
        Are there schema changes?
        ├─ Yes → Migrations applied and verified?
        │   ├─ No → Generate and apply migrations
        │   └─ Yes → Continue
        └─ No → Continue
            │
            Are there UI changes?
            ├─ Yes → Browser verified?
            │   ├─ No → Test in browser
            │   └─ Yes → Continue
            └─ No → Continue
                │
                Is this a new feature?
                ├─ Yes → Documentation added?
                │   ├─ No → Add documentation
                │   └─ Yes → Continue
                └─ No → Continue
                    │
                    ✅ READY TO MERGE
```

---

## Output

After running this checklist, provide:
1. **Status report** in the format above
2. **Clear verdict** on whether the feature is ready
3. **Action items** for any blockers or missing items
4. **Commands** the user can run to fix any issues
