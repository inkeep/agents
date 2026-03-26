Use when: Skills that manage persistent state across turns or sessions (e.g., spec authoring, research, feature development)
Priority: P1
Impact: No guidance for artifact lifecycle, session resumption, evidence/synthesis separation; stateful skills become fragile across sessions

---

# Stateful Skill Patterns

These patterns apply to skills that **manage persistent state** — artifacts that are written, read, and updated across multiple turns or sessions. Examples: spec authoring, research, feature development, iterative review.

They do NOT apply to:
- Background knowledge skills (no artifacts)
- Single-exchange skills (no evolving state)
- Skills that write a file once and are done (no lifecycle to manage)

---

## 1) Separate evidence from synthesis

When the skill persists information to artifacts, distinguish:

- **Evidence** (observable, factual, verifiable) — code traces, API shapes, search results, dependency behavior. Can be persisted immediately. Facts don't need invoker validation.
- **Synthesis** (interpretive, judgment-dependent) — design recommendations, trade-off assessments, priority judgments. Should wait for invoker confirmation before being persisted to the canonical deliverable.

Why this matters: premature synthesis in artifacts creates false confidence and makes it harder to course-correct. The invoker may not realize a recommendation was the agent's interpretation rather than established fact.

**In the skill, write:**
- Specify which artifacts hold evidence (e.g., `evidence/*.md`) and which hold synthesis (e.g., `SPEC.md`).
- Instruct the agent to persist evidence immediately but hold synthesis for invoker confirmation before writing to the canonical deliverable.

---

## 2) Persist based on insight type, not cadence

Instruct the agent to externalize information based on **what kind of information it is**, not on a timer or turn count.

**Fragile:**
> "Update SPEC.md every 5 turns" or "Save progress at the end of the session."

**Robust:**
> "When you discover a new factual finding (code trace, API behavior, search result), append it to evidence immediately. When the invoker confirms a decision, update the decision log and the relevant spec section."

Why this matters: insights emerge unpredictably. A critical finding in turn 2 shouldn't wait until a checkpoint at turn 10. Conversely, writing to artifacts on every turn creates noise and wastes tool calls.

---

## 3) Design for session resumption

If the skill spans sessions, the artifacts it creates must be written with future resumption in mind. A resuming agent starts with zero context — everything it knows must be explicitly loaded.

**In the skill, specify a re-entry path:**
1. Load the canonical deliverable (current-state snapshot of the work)
2. Load structured state (decision logs, open questions, assumption registers)
3. Optionally load recent evidence for additional context
4. Synthesize a working understanding before proceeding

**Design principle:** A deliverable that reads as a clean current-state snapshot ("what we believe now") is more useful for resumption than one that requires reading the full conversation history to understand. This means the skill should instruct the agent to maintain the deliverable as a living document — not append session notes to it.

---

## 4) State mutations are discipline, not conversation

State mutations (writing files, updating artifacts, appending to logs) should happen continuously as part of the agent's work, but they are not the substance of the conversation.

**In the skill, instruct:**
- Messages carry what shifted in understanding and why it matters — not a manifest of files touched.
- The invoker steers via messages. Artifacts update as a consequence of the work.

**Fragile:**
> "I've updated SPEC.md lines 45-67, added a new entry to evidence/auth.md, and appended to meta/changelog.md."

**Robust:**
> "The auth flow analysis revealed a session fixation risk. I've updated the spec's security section to reflect this. Should we escalate this to a P0 blocker?"

(See also content pattern #18: "Messages carry substance, not mechanics.")

---

## Additional patterns to consider

### 5) Cascade on invalidation

When new information refutes an earlier assumption or decision, the agent should trace dependencies and update all affected artifacts — not just the directly impacted one. In the skill, define what depends on what: if an assumption is refuted, which spec sections reference it? If a design decision changes, which downstream artifacts (plans, acceptance criteria, evidence files) need review? Without explicit dependency awareness, invalidated assumptions silently poison downstream artifacts.

### 6) Design for progressive context revelation

The invoker rarely provides all relevant context upfront. The skill should instruct the agent to maintain structured state alongside conversation (assumption registers, decision logs, open question lists) rather than relying on raw conversation as the sole source of truth. When the invoker provides new context that changes earlier understanding, the agent should make explicit what changed and update affected artifacts (see pattern #5). As context grows, the agent should prioritize preserving invoker goals and its own reasoning trace in full, while compressing raw observations and intermediate data.
