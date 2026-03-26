Use when: Phase 1, Step 3 — creating execution state and activating the ship loop
Priority: P0
Impact: Without state initialization, stop hook cannot recover context after compaction, loop cannot activate

---

# State Initialization

The ship directory is configurable via `CLAUDE_SHIP_DIR` env var (default: `tmp/ship`). The initialization script respects this env var automatically. Throughout this reference, `tmp/ship/` refers to the resolved directory.

The worktree and feature branch were created in Phase 0, Step 1. Dependency installation and build verification are handled by `/implement` at the start of Phase 2.

## Run the initialization script

**Do not manually write state files.** Use the initialization script to create both `tmp/ship/state.json` and `tmp/ship/loop.md` in a single deterministic step:

```bash
<path-to-skill>/scripts/ship-init-state.sh \
  --feature "<feature-name>" \
  --spec "<path-to-SPEC.md>" \
  --branch "<feature-branch-name>" \
  --worktree "<worktree-path>" \
  --scope "<feature|enhancement|bugfix>" \
  --test-cmd "<test command>" \
  --typecheck-cmd "<typecheck command>" \
  --lint-cmd "<lint command>" \
  --gh <true|false> \
  --browser <true|false> \
  --peekaboo <true|false> \
  --docker <true|false>
```

Where `<path-to-skill>` is this skill's base directory (shown in the skill header when loaded).

**Required arguments:** `--feature`, `--spec`, `--branch`. All others have defaults.

**Default values:**
- `--worktree` → empty (working in-place)
- `--scope` → `feature`
- `--test-cmd`, `--typecheck-cmd`, `--lint-cmd` → empty (no quality gate)
- `--gh` → `true`; `--browser`, `--peekaboo`, `--docker` → `false`
- `--max-iterations` → `20`

Fill in every value you know from Phase 0 (capability detection, scope calibration) and Phase 1 (feature name, spec path, branch). Omit flags where the default is correct.

### Incorrect vs correct

**Incorrect** — hand-writing state files:

```bash
# DO NOT DO THIS — malformed JSON, missing fields, and wrong YAML
# are the #1 cause of stop hook failures
mkdir -p tmp/ship
cat > tmp/ship/state.json << 'EOF'
{
  "currentPhase": "Phase 2",
  "featureName": "revoke-invite",
  ...
}
EOF
```

**Correct** — use the script:

```bash
<path-to-skill>/scripts/ship-init-state.sh \
  --feature "revoke-invite" \
  --spec "specs/revoke-invite/SPEC.md" \
  --branch "feat/revoke-invite" \
  --scope "feature" \
  --test-cmd "pnpm test" \
  --typecheck-cmd "pnpm typecheck" \
  --lint-cmd "pnpm lint" \
  --gh true --browser true
```

### Verify after running

After the script runs, verify both files were created:

```bash
test -f tmp/ship/state.json && test -f tmp/ship/loop.md && echo "State initialized" || echo "ERROR: state files missing"
```

If either file is missing, check the script's error output and re-run. Do not proceed to Phase 2 without both files.

### What the script creates

**`tmp/ship/state.json`** — Workflow state so hooks can recover context after compaction:

```json
{
  "currentPhase": "Phase 2",
  "featureName": "<from --feature>",
  "specPath": "<from --spec>",
  "specJsonPath": "tmp/ship/spec.json",
  "branch": "<from --branch>",
  "worktreePath": "<from --worktree, or null>",
  "prNumber": null,
  "qualityGates": { "test": "<cmd>", "typecheck": "<cmd>", "lint": "<cmd>" },
  "completedPhases": ["Phase 0", "Phase 1"],
  "capabilities": { "gh": true, "browser": false, "peekaboo": false, "docker": false },
  "scopeCalibration": "<from --scope>",
  "amendments": [],
  "lastUpdated": "<ISO 8601 timestamp>"
}
```

**`tmp/ship/loop.md`** — Loop control that activates the stop hook:

```markdown
---
active: true
iteration: 1
max_iterations: 20
completion_promise: "SHIP COMPLETE"
started_at: "<ISO 8601 timestamp>"
---
```

### Field reference

| Field | Set when | Updated when |
|---|---|---|
| `currentPhase` | Initialization | Every phase transition |
| `featureName` | Initialization | — |
| `specPath` | Initialization | — |
| `specJsonPath` | Initialization | — |
| `branch` | Initialization | — |
| `worktreePath` | Initialization | — |
| `prNumber` | Initialization (`null`) | After PR creation (set to PR number) |
| `qualityGates` | Initialization (from Phase 0 detection) | — |
| `completedPhases` | Initialization | Append at each phase transition |
| `capabilities` | Initialization (from Phase 0 detection) | — |
| `scopeCalibration` | Initialization (from Phase 0 Step 4) | — |
| `amendments` | Initialization (empty) | Any phase: append when user requests post-spec changes |
| `lastUpdated` | Initialization | Every phase transition |

## What happens after activation

The stop hook is now active. If your context is compacted or you try to exit, the hook blocks exit and re-injects a phase-aware prompt with your current state, keeping you working through all remaining phases. The loop runs until you complete all phases and output `<complete>SHIP COMPLETE</complete>`, or until 20 iterations are reached.

To cancel the loop manually: `/cancel-ship`
