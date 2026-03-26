Use when: Phase 0, Step 2 — detecting execution context and available capabilities
Priority: P0
Impact: Without capability detection, child skills receive wrong flags and phases are skipped or run with wrong assumptions

---

# Capability Detection

Detect what capabilities are available before starting work. For each capability, resolve using:

1. **User-specified override** → respect unconditionally
2. **Default assumption + runtime probe** → test the environment
3. **Degradation path** → if the probe fails

## Probe table

| Capability | Probe | If unavailable |
|---|---|---|
| GitHub CLI | `gh auth status` | Skip PR creation (after Phase 3) and review (Phase 5) |
| Quality gate commands | Read `package.json` `scripts` field; check for `pnpm`/`npm`/`yarn`; accept user `--test-cmd` / `--typecheck-cmd` / `--lint-cmd` overrides | Use discovered commands; halt if no typecheck AND no test command works |
| Browser automation (`/browser`) | Check if `/browser` skill is loadable (Playwright-based headless automation) | Substitute Bash-based testing; pass `--no-browser` to `/implement` for criteria adaptation. When available, `/browser` provides console monitoring, network capture, a11y audits, screenshot helpers, dialog handling, overlay dismissal, page structure discovery, tracing, PDF generation, file download handling, and auth state persistence — used by `/qa`, `/review`, and `/screengrabs`. |
| macOS computer use | Check if `mcp__peekaboo__*` tools are available | Skip OS-level testing; document gap |
| Claude CLI subprocess | Detected by `/implement` during Phase 2 execution | `/implement` handles degradation internally — if subprocess unavailable, it provides manual iteration instructions. Ship does not need to detect this. |
| Docker execution (`--implement-docker`) | User passes `--implement-docker` (optionally with compose file path) | Host execution (default). When passed, forwarded to `/implement` as `--docker` in Phase 2. The skill auto-discovers the compose file if no path given. |
| /spec skill | Check skill availability | Require SPEC.md as input (no interactive spec authoring) |
| /explore skill | Check skill availability | Use direct codebase exploration (Glob, Grep, Read) |

## Recording results

Record what's available. These results are stored in `tmp/ship/state.json` (created in Phase 1) under the `capabilities` and `qualityGates` fields, and flow through all subsequent phases as flags to child skills.

## Communicating to user

If any capability is unavailable: briefly state which capabilities are missing and what will be skipped or degraded. Keep to 2-3 sentences. Frame as a **negotiation checkpoint** — the user may be able to fix the issue (e.g., re-authenticate `gh`, start Chrome extension) before work proceeds.

If all capabilities are available: proceed directly without discussion.

## Delegation stance

When ship is invoked with `--delegated` flag, or when operating in an isolated environment (worktree, container):

- Capability detection runs identically — same probes, same results recording.
- **Communication changes:** Results are recorded to `state.json` and flowed to child skills as explicit flags. Missing capabilities are documented but do NOT pause for user negotiation — degradation paths are pre-planned in each child skill.
- **Flag propagation:** Pass `--delegated` to all child skills that support the autonomy convention (`/debug`, `/qa`). This signals that the child skill should operate at Delegated autonomy level — iterating freely within its approved action classes without per-action human approval.

Child skills that don't recognize `--delegated` ignore it — the flag is forward-compatible.
