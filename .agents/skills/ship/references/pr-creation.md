Use when: After Phase 2 (Implementation) — creating the draft PR so subsequent phases can post results as PR comments
Priority: P0
Impact: Without early PR creation, /qa cannot post its checklist as a PR comment and QA results are lost on context compaction

---

# Draft PR Creation

Create a draft PR with a stub body after implementation completes. This gives subsequent phases (QA testing, documentation) a PR to post results to. The full PR body is written later by `/pr` after testing is complete.

## Steps

### 1. Push the branch

```bash
git push -u origin <branch>
```

If the push fails (e.g., no remote, auth issue), note the failure and continue — the PR can be created later. Set `prNumber: null` in `state.json`.

### 2. Create the draft PR

```bash
gh pr create --draft --title "<concise title>" --body "$(cat <<'EOF'
## Summary

Implementation of <feature name>. Full PR description will be added after testing.

---
*Draft — PR body pending /pr.*
EOF
)"
```

Derive the title from the SPEC.md title or `state.json` feature name. Keep it under 72 characters.

### 3. Update state.json

Set `prNumber` to the PR number returned by `gh pr create`.

## If `gh` is unavailable

Set `prNumber: null` in `state.json`. The workflow continues without a PR:

- Phase 3 (`/qa`): QA checklist tracked in conversation only
- Phase 4 (`/docs`): docs committed to the branch but not linked to a PR
- Phase 5 (`/review`): skipped entirely
- After Phase 6: user creates the PR manually
