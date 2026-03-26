Use when: Skills with scripts, tool access, external fetching, or high-stakes domains
Priority: P1
Impact: Security vulnerabilities; unsafe defaults; unreviewed destructive operations

---

# Security and Governance

Skills can:
- instruct tool use
- bundle runnable scripts
- influence decisions in high-stakes domains

Treat them like installing software.

---

## Safer defaults

- Prefer guidance-only skills unless scripts are truly valuable.
- Prefer read-only tools unless writes are required.
- Prefer manual-only invocation for state-changing workflows.

---

## Scripts safety checklist

Before trusting a script:
- [ ] No unexpected network calls
- [ ] No secret scraping (env, credentials files)
- [ ] Clear inputs/outputs
- [ ] Helpful error messages
- [ ] No destructive defaults (e.g., rm -rf)
- [ ] Any destructive action requires explicit confirmation

---

## External data risks

Skills that fetch URLs or rely on mutable external content can be compromised.
If external fetching is necessary:
- whitelist domains
- validate content
- log exactly what was fetched and used

---

## Tool restrictions

Use `allowed-tools` to minimize blast radius.
If the skill must run Bash, consider:
- restricting commands by pattern (where supported)
- making it manual-only

---

## Human review for high-stakes skills

If skills affect:
- prod deploys
- security-sensitive reviews
- data migrations
- financial/legal outputs

Require:
- review by a domain owner
- a minimal evaluation suite
- explicit "stop and verify" steps
