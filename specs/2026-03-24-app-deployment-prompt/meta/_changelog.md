# Changelog

## 2026-03-24 — Session 1: Spec initiated

- **Intake complete**: Problem framed (SCR), stress-tested, initial decisions confirmed
- **Decisions locked**:
  - D1: Append/supplemental semantics (not override)
  - D2: `web_client` and `api` app types only; work apps deferred
  - D3: New `<app_context>` section in system prompt template (after `agent_context`)
- **Investigation**: Traced full prompt construction pipeline, app config schema, runtime auth flow
- **Scaffold**: Created SPEC.md with world model, vertical slice, and open questions
- **All P0 OQs resolved**: No limit (D6), token count in breakdown (D7), field name `prompt` (D8)
- **Adversarial review passed**: Checked edge cases (clearing prompt, non-app paths, sub-agent transfers, SDK compat, migration safety, prompt ordering, template variable collision)
- **Spec frozen**: All In Scope items pass resolution completeness gate
