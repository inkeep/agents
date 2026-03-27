# PRD-6264: Restrict Allowed Tools in Claude CI Workflows

**Status:** Ready for implementation
**Priority:** High (Security)
**Linear:** https://linear.app/inkeep/issue/PRD-6264
**Dependencies:** None (independent)

---

## 1. Problem

`claude.yml` and `ci-maintenance.yml` run `anthropics/claude-code-action@v1` with **no `--allowedTools` restriction**, giving Claude unrestricted Bash access in CI — including `curl`, `wget`, `env`, `printenv`, and arbitrary command execution.

**Attack vector:** A prompt injection via PR diff content, issue body, or file under review could instruct Claude to exfiltrate the `ANTHROPIC_API_KEY` (or other secrets) via network requests. The `author_association` gate and Claude's safety training are defense-in-depth, not guarantees.

**Two other workflows already follow best practices:** `claude-code-review.yml` (L739) and `closed-pr-review-auto-improver.yml` (L234) both use explicit `--allowedTools` allowlists. `model-sync.yml` (L58) also has a scoped allowlist.

## 2. Scope

### In Scope
- Add `--allowedTools` to `claude.yml`
- Add `--allowedTools` to `ci-maintenance.yml`

### Out of Scope
- `claude-code-review.yml` — already restricted
- `closed-pr-review-auto-improver.yml` — already restricted
- `model-sync.yml` — already restricted, `Bash(git push:*)` is intentional

## 3. Changes

### 3a. `.github/workflows/claude.yml` (L47)

**Before:**
```yaml
claude_args: '--model opus'
```

**After:**
```yaml
claude_args: >-
  --model opus
  --allowedTools "Read,Write,Edit,Grep,Glob,Bash(git:*),Bash(gh:*),Bash(pnpm:*),Bash(turbo:*),Bash(node:*),Bash(ls:*),Bash(cat:*),Bash(mkdir:*),Bash(cp:*),Bash(mv:*),Bash(rm:*),Bash(head:*),Bash(tail:*),Bash(wc:*),Bash(sort:*),Bash(uniq:*),Bash(find:*),Bash(echo:*),Bash(test:*),Bash(diff:*),Bash(sed:*),Bash(awk:*),Bash(jq:*),Bash(xargs:*)"
```

### 3b. `.github/workflows/ci-maintenance.yml` (L168)

**Before:**
```yaml
uses: anthropics/claude-code-action@v1
with:
  anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
  prompt: |
```

**After:**
```yaml
uses: anthropics/claude-code-action@v1
with:
  anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
  claude_args: >-
    --allowedTools "Read,Write,Edit,Grep,Glob,Bash(git:*),Bash(gh:*),Bash(pnpm:*),Bash(turbo:*),Bash(node:*),Bash(ls:*),Bash(cat:*),Bash(mkdir:*),Bash(cp:*),Bash(mv:*),Bash(rm:*),Bash(head:*),Bash(tail:*),Bash(wc:*),Bash(sort:*),Bash(uniq:*),Bash(find:*),Bash(echo:*),Bash(test:*),Bash(diff:*),Bash(sed:*),Bash(awk:*),Bash(jq:*),Bash(xargs:*)"
  prompt: |
```

### Tool allowlist rationale

**Included (legitimate CI work):**
| Tool | Why |
|------|-----|
| `Read,Write,Edit,Grep,Glob` | Core Claude Code tools (no Bash) |
| `Bash(git:*)` | All git operations (commit, push, branch, etc.) |
| `Bash(gh:*)` | GitHub CLI (PR creation, issue management, API calls) |
| `Bash(pnpm:*)` | Package manager (install, build, test, lint, format) |
| `Bash(turbo:*)` | Monorepo build orchestration |
| `Bash(node:*)` | Running Node.js scripts |
| `Bash(ls:*),Bash(cat:*),Bash(mkdir:*),Bash(cp:*),Bash(mv:*),Bash(rm:*)` | Basic file operations |
| `Bash(head:*),Bash(tail:*),Bash(wc:*),Bash(sort:*),Bash(uniq:*),Bash(find:*)` | Text/file utilities |
| `Bash(echo:*),Bash(test:*),Bash(diff:*)` | Scripting primitives |
| `Bash(sed:*),Bash(awk:*),Bash(jq:*),Bash(xargs:*)` | Text processing (needed for CI maintenance fixes) |

**Excluded (exfiltration vectors):**
| Tool | Risk |
|------|------|
| `curl`, `wget`, `nc`, `ncat` | Network requests — primary exfiltration vector |
| `env`, `printenv`, `set` | Environment variable inspection |
| `python`, `ruby`, `perl` | Interpreters that can bypass restrictions |
| Unrestricted `bash -c` | Arbitrary command execution |
| `npx` | Can download and execute arbitrary packages |
| `dig`, `nslookup`, `host` | DNS exfiltration |

### Residual risks (accepted)

| Risk | Severity | Notes |
|------|----------|-------|
| `node -e "fetch('https://...')"` | Medium | Node has built-in `fetch`. Needed for builds/scripts — can't restrict without breaking CI. |
| `gh api` could send data to GitHub endpoints | Low | Stays within GitHub infrastructure |
| `git push` to attacker remote | Low | Requires `git remote add` first; detectable; scoped by App token |

## 4. Decision Log

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Include `npx` in excluded list | Risk of downloading arbitrary packages. All tooling accessible via `pnpm` scripts. |
| D2 | Include `sed`, `awk`, `jq`, `xargs` | ci-maintenance needs text processing for fixing CI issues. Not exfiltration vectors. |
| D3 | Accept `node -e fetch()` residual risk | Can't exclude `node` without breaking builds/tests. Defense-in-depth from Claude's safety training + author_association gate. |
| D4 | Use identical allowlist for both workflows | Simpler to maintain. ci-maintenance doesn't need less; claude.yml doesn't need more. |

## 5. Acceptance Criteria

- [ ] `claude.yml` has `--allowedTools` in `claude_args`
- [ ] `ci-maintenance.yml` has `--allowedTools` in `claude_args`
- [ ] No `curl`, `wget`, `env`, `printenv`, `python`, `npx` in either allowlist
- [ ] Existing `@claude` workflow functionality preserved (git ops, pnpm, gh CLI, file operations)
