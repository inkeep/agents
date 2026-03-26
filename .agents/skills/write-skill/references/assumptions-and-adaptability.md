Use when: Skill depends on external tools, platform capabilities, a specific workflow model, or execution context
Priority: P1
Impact: Implicit assumptions baked into skill; silent failures when used in different contexts; costly retroactive audits

---

# Operating Assumptions and Adaptability

When a skill depends on anything beyond "the agent can read and write files," those dependencies are **operating assumptions**. This reference helps you identify, classify, and (when appropriate) adapt around them.

Not every skill needs this. Simple guidance-only skills or single-file rules typically have no operating assumptions. Use this reference when the skill invokes external tools, depends on platform features, assumes a specific workflow, or assumes user intent beyond what's captured as explicit inputs.

---

## Five categories

| Category | What it covers | Example |
|---|---|---|
| **Tool/binary** | External CLIs, package managers, shell utilities | "`gh` CLI is installed," "`pnpm` is available" |
| **Platform capability** | Agent-runtime features, MCP tools, plugins | "Browser automation tools are available," "Claude CLI is on PATH" |
| **Workflow model** | Collaboration patterns, branching strategies, review processes | "PR-based review loop," "git worktree for isolation" |
| **User intent** | What the user wants to happen beyond explicit inputs | "User wants code pushed to remote," "user wants a draft PR" |
| **Composition** | Other skills or plugins that must be present | "/spec skill is available," "/review skill can be composed" |

---

## Three-way classification

For each assumption, classify:

| Classification | Meaning | What to write in the skill |
|---|---|---|
| **Hard requirement** | Skill fundamentally broken without this. No meaningful degradation. | Fail-fast validation early in the workflow. Document the requirement clearly (e.g., "Requires: `git` CLI"). |
| **Adaptable** | Skill can work differently without this. Value may be reduced but core function is preserved. | Write an adaptation path using one of the four patterns below. |
| **Intentional** | The skill deliberately assumes this and should NOT adapt. Context-specificity is a feature, not a gap. | Document the assumption explicitly so users know the scope (e.g., "This skill is designed for PR-based workflows"). |

The "intentional" classification prevents over-degradation — not every assumption needs a fallback. A skill designed specifically for PR-based workflows should say so, not try to become something else when no PR exists.

---

## Four adaptation patterns

When an assumption is classified as "adaptable," choose a pattern:

| Pattern | When to use | Example |
|---|---|---|
| **Substitute** | An alternative approach achieves the same goal | Browser testing unavailable → substitute with Bash/curl API testing |
| **Skip + document** | The step adds value but isn't essential; skipping is acceptable if the gap is noted | macOS tools unavailable → skip, note "OS-level testing not performed" |
| **Fallback chain** | Multiple approaches exist, ordered by preference | Helper scripts → inline CLI commands → manual instructions |
| **Parameter override** | The user or orchestrator provides the right value for their context | `--test-cmd 'npm test'` overrides default `pnpm test --run` |

---

## Resolution order

When an assumption is adaptable, resolve in this order:

1. **User-specified override** → respect unconditionally
2. **Default assumption** → attempt; probe at runtime if feasible
3. **Probe fails** → follow the adaptation path

This means: always honor user intent first, then try the default, then degrade gracefully.

---

## Expressing adaptation paths in the skill

Use a decision table with a "fallback column" (`| Capability | Use for | If unavailable |`) to present capabilities alongside their adaptation paths — this is the most scannable format for readers (see content pattern #2 for broader decision-table patterns).

When writing adaptation logic in the workflow body:

- **1–2 adaptable assumptions:** Write the conditional inline at the step where it matters. E.g., "If browser tools are available, verify the UI end-to-end. Otherwise, substitute with `curl`-based API testing and note: 'UI not visually verified.'"
- **3+ adaptable assumptions affecting multiple steps:** Detect capabilities once in an early workflow step (e.g., "Phase 0: Detect environment") and reference the results in later steps. This avoids repeating detection logic and keeps later steps clean.

---

## Quick verification

After identifying and classifying your operating assumptions, verify:

- [ ] Each assumption is categorized (tool / platform / workflow / intent / composition)
- [ ] Each assumption is classified (hard requirement / adaptable / intentional)
- [ ] Hard requirements have fail-fast validation early in the workflow
- [ ] Adaptable assumptions have a named adaptation pattern and a written adaptation path
- [ ] Intentional assumptions are documented explicitly (not left implicit)
- [ ] For skills with adaptation paths: test in contexts where the assumed capability is unavailable
