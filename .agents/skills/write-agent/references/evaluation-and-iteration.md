Use when: Tuning delegation behavior; debugging over/under-triggering; adjusting verbosity or scope creep
Priority: P1
Impact: Without iteration guidance, agents stay miscalibrated; common fixes are non-obvious

---

# Evaluation & Iteration (Reference)

## Iteration Heuristics

If delegation is too frequent:
- Narrow the description triggers.
- Add explicit exclusions ("Do not use for X").
- Add/strengthen a near-miss `<example>` with clear commentary.

If delegation never happens:
- Add concrete keywords and file patterns to the description.
- Add/strengthen `<example>` blocks (2–4 total).
- Use "use proactively…" phrasing if you want aggressive delegation.

If output is too verbose:
- Strengthen the output contract.
- Add a "verbosity limit" rule.

If it misses key checks:
- Add a required checklist item ("Always run X", "Always verify Y").

If it overreaches / changes too much:
- Tighten scope and non-goals.
- Reduce tool access and/or use plan mode or reviewer pattern.

## Maintenance

- Prefer small edits to prompts based on observed failures.
- Keep a short changelog in git history rather than inside the agent file.

## Designer vs Runtime Failure Modes

When an agent underperforms, first identify whether the failure is a **designer problem** or a **runtime problem**:

| Category | What it means | Examples | Fix |
|---|---|---|---|
| **Designer failure** | The prompt itself has issues (ambiguity, missing guidance, structural problems) | Instructions could be read two ways; missing escalation rules; no output contract | Edit the agent prompt |
| **Runtime failure** | The prompt is sound but the model misapplies it | Model ignores clear instruction; hallucinates despite guardrails; over-triggers on near-misses | Strengthen emphasis, add examples, or accept limitation |

**Common designer failure modes:**
- Writing instructions that could be interpreted differently in another context
- Assuming context the agent won't have (relies on parent chat history)
- Missing the failure modes most relevant to the agent's task
- Output contract too vague to validate against
- Escalation rules missing or unclear

**Diagnostic questions:**
1. If I gave this prompt to a different model or instance, would they interpret it the same way?
2. Are there instructions that could be read two ways?
3. Does the agent have enough context to judge edge cases?
4. Is the output contract specific enough to know when output is "good"?

If the answer to any of these is "no," it's likely a designer failure. Fix the prompt before blaming the model.

**Load:** `references/designer-failure-modes.md` for the full designer self-check (when available).
