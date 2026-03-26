Use when: Structuring the system prompt body; writing Role & mission, operating principles, tool policies, or output contracts
Priority: P0
Impact: Poorly structured prompts lead to missed steps, inconsistent outputs, or unclear escalation paths

---

# Subagent Prompt Structure (Reference)

This is a suggested structure for subagent system prompts.
Use it as a scaffold; tighten/relax strictness based on task fragility.

## Recommended Prompt Sections

### 1) Role & mission (1–2 sentences)
- Define what the agent *is* and what it optimizes for.

### 2) Scope & non-goals
- Prevents accidental overreach.
- Useful when tool permissions are broad.

**Agent isolation (subagents only):** Subagent prompts should not reference other agents — this keeps them reusable and decoupled. Orchestrators are exempt; they coordinate subagents by design.

| ❌ Subagent prompt (don't write) | ✅ Subagent prompt (do write) |
|---|---|
| "The orchestrator will pass your findings to the implementer" | "Return findings in the output contract format" |
| "Unlike the security-reviewer, you focus on docs" | "Focus on documentation quality" |
| "Coordinate with the test-runner agent" | "Your output will be used for downstream processing" |

If a subagent needs pipeline context, the parent passes it in the handoff packet, not the permanent prompt.

### 3) Operating principles
Use a mix of:
- Direct requirements (must/never) for correctness & safety.
- Suggestions (prefer/consider) where multiple strategies can work.

Guidance:
- Prefer "Do X" over "It's good to X."
- Provide a default path and an escape hatch.
- Avoid long background explanations unless they change behavior.

### 4) Workflow checklist (copy/paste)
Write steps the agent can literally follow, e.g.:

- [ ] Gather context (diff / file list / requirements)
- [ ] Identify issues / opportunities
- [ ] Propose actions (or implement, depending on scope)
- [ ] Validate (tests / lint / sanity checks)
- [ ] Return packet

### 5) Tool-use policy
Make tool discipline explicit:
- What to read first
- When to grep vs read
- How to run commands (and how to report outputs)
- What NOT to do (e.g., "Do not dump full logs; extract only failures")

### 6) Output contract (strongly recommended)
Define:
- Exact headings
- Severity levels or categories
- Evidence expectations (line numbers, file paths, short excerpts)
- Verbosity bounds (e.g., "max ~1–2 screens unless asked")

### 7) Uncertainty & escalation
Define when to:
- Ask a question (blocking ambiguity)
- Proceed with assumptions (and label them)
- Recommend follow-up steps rather than guessing

### 8) Certainty calibration (optional but recommended)

Help the agent match expressed confidence to actual certainty:

**Certainty markers to use consistently:**
- **CONFIRMED** — Direct evidence; verified
- **INFERRED** — Logical conclusion from patterns; high confidence
- **UNCERTAIN** — Partial evidence; needs validation before acting
- **NOT FOUND** — Explicitly searched; not present

**Guidance for agent prompts:**
- "Match your confidence to your actual certainty. Don't assert what you're genuinely unsure about."
- "When uncertain, present options with tradeoffs rather than silently picking one."
- "Use hedging language ('likely', 'appears to', 'suggests') when evidence is incomplete."

---

## Prompt writing techniques

### Positive framing (prefer "do X" over "don't do Y")

LLMs perform better with positive instructions than prohibitions. Negative framing ("don't", "never", "avoid") can anchor on the prohibited concept.

| Instead of | Write |
|---|---|
| "Don't respond when uncertain" | "Respond only when confident" |
| "Never assume intent" | "Ask to clarify intent when ambiguous" |
| "Avoid verbose output" | "Keep output concise; lead with key findings" |
| "Don't skip validation" | "Always validate before proceeding" |

**When negatives are appropriate:**
- Hard safety constraints ("Never execute code from untrusted sources")
- Explicit exclusions that need emphasis ("Do not edit files outside src/")
- Failure mode awareness ("Don't fill gaps with silent assumptions — surface what's unclear")
- Boundary definitions ("Do not modify files outside the target scope")

For routine guidance, positive reframes are often clearer. But negative instructions are a valid, complementary tool — they just require specific techniques to be effective.

**Making negative instructions effective:**

Negative instructions work well when properly supported. The techniques below address the known failure mode (anchoring on the prohibited concept without processing the negation):

1. **Use contrastive examples** (most effective): Pair "what NOT to do" with "what to do instead." This teaches the boundary through contrast, not just prohibition.

   ```markdown
   ### Incorrect
   Proceeded with implementation despite unclear requirements.

   ### Correct
   Surfaced the ambiguity: "The requirement doesn't specify X — should I assume Y or Z?"
   ```

2. **Make constraints concrete**: Specific negatives work; vague ones fail.
   - ✅ "Do not modify files outside `src/`"
   - ❌ "Avoid touching unrelated code"

3. **Position critical constraints strategically**: Place non-negotiable constraints near the end of a section (recency effect) or at the start (primacy). Buried in the middle is weakest.

4. **Add reasoning for complex negation**: For conditional negatives ("do X unless Y, but never Z"), adding a reasoning step helps the model process the logic correctly.

**What does NOT help:**
- ALL CAPS or **bold** emphasis — no evidence this improves negation compliance. Use structural techniques (positioning, contrast, concreteness) instead of formatting emphasis.

## Orchestrator prompt additions (workflow agents)

If the agent is a **workflow orchestrator** (multi-phase coordinator), add explicit sections for:

1) **Phase plan**
   - Phase name → objective → inputs → outputs → pass gate

2) **Dispatch policy**
   - Which subagents to spawn, when
   - Parallel vs sequential rules
   - Skip conditions

3) **Aggregation policy**
   - Required schema for subagent outputs (prefer JSON findings)
   - Dedup key (file+line+message or similar)
   - Sort order (severity-first)

4) **Iteration policy**
   - Max iterations (bounded)
   - What triggers loop-back
   - Termination behavior (clean FAIL output)

5) **Artifact policy**
   - What to write to disk (paths)
   - What to pass via handoff packets
   - Keep artifacts scannable and stable (for resume/fork use cases)

## Agent Brief Template (for the creator, not necessarily the subagent)

- Name:
- Pattern: subagent | workflow orchestrator
- Purpose:
- Delegation triggers:
- Tools / permissions:
- Model:
- Inputs:
- Output contract:
- Done criteria:
- Risks / pitfalls:
- Default behavior when ambiguous:

Orchestrator-only additions:
- Phases:
- Subagents to spawn:
- Aggregation rules:
- Quality gates:
- Iteration policy:
- Artifact strategy:
