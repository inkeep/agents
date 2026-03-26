Use when: Phase 6 — final verification before declaring completion
Priority: P0
Impact: Without the checklist, incomplete work ships as "done" and the completion promise fires prematurely

---

# Completion Checklist

Before declaring done, verify:

## All builds (always required)

- [ ] All tests passing
- [ ] Type checking passing
- [ ] Linting passing
- [ ] Formatting clean
- [ ] No `TODO` or `FIXME` comments left from implementation
- [ ] Documentation is up-to-date and accurately reflects the final implementation (Phase 4 docs maintenance rule)

## If a PR exists

- [ ] PR description is comprehensive, up-to-date, and matches the `/pr` template (all applicable sections filled, self-contained, stateless)
- [ ] Changelog entries created for published package changes (if applicable)
- [ ] All reviewer feedback threads resolved (accepted or declined with reasoning)
- [ ] CI/CD pipeline green

## Completion report

Report completion status to the user with a summary of:
- PR URL (if a PR was created)
- TLDR of what was built
- ANY deviations from the 'SPEC.md' and reasoning/context for that drift
- Any issues relating to environment, devops, or tools available
