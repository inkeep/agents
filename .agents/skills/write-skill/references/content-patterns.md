Use when: Drafting SKILL.md body sections (workflow, decision tables, examples, output format)
Priority: P0
Impact: Missing high-signal patterns; increased hallucination risk; inconsistent outputs

---

# Content Patterns

These patterns tend to increase skill reliability and decrease hallucinations.

## 1) Start with a "default workflow"

A simple, numbered sequence is often the highest ROI:

1. Gather inputs
2. Choose strategy
3. Execute
4. Validate
5. Report results

If the workflow branches, add a short decision table.

---

## 2) Use decision tables for branching

Example:

| Condition | Do |
|---|---|
| No repo context available | Ask for repo path / files |
| Risky operation | Require manual confirmation |
| Many repeated micro-rules | Use a rules/ pattern |

For capabilities or tools with fallbacks, add an "If unavailable" column:

| Capability | Use for | If unavailable |
|---|---|---|
| Browser automation | UI testing, visual verification | Substitute with Bash API testing; note the gap |
| GitHub CLI | PR creation, review loop | Use `gh api` commands directly |

---

## 3) Use severity levels when reviewing or enforcing quality

Example:
- **CRITICAL**: correctness, security, data loss risks
- **HIGH**: broken behavior, major performance issues
- **MEDIUM**: maintainability, future risk, edge-case fragility
- **LOW**: style, minor cleanup

This helps the model prioritize and prevents "nit overload."

---

## 4) Include "Incorrect vs Correct" examples

This is one of the best anti-hallucination tools.

Template:
```md
### Incorrect
```language
...
```

### Correct
```language
...
```
```

---

## 5) Use copy/paste checklists for complex tasks

Example:
```md
Copy and track:

- [ ] Step 1: ...
- [ ] Step 2: ...
- [ ] Step 3: ...
```

---

## 6) Provide a strict output template when consistency matters

If the output should be machine-parseable or consistent, be strict.

Example:
```md
ALWAYS output:

## Summary
...

## Findings
- [CRITICAL] ...
- [HIGH] ...
- [MEDIUM] ...
- [LOW] ...

## Next steps
1. ...
```

If flexibility matters more, say:
"Here is a sensible default format; adapt as needed."

---

## 7) Prefer "validation loops" over "trust the model"

Template:

1. Make the change
2. Run validation: `...`
3. If it fails, fix and re-run
4. Stop only when validation passes

---

## 8) Keep "routing" keywords in description, not only the body

Discovery uses metadata first. Put trigger terms in the description:

* file extensions
* tool names
* domain nouns and verbs
* common user phrasing

You can still include a "When to use" section for humans, but don't rely on it for routing.

---

## 9) Default to standalone, reader-first artifacts

Unless the user specifies otherwise:

* Assume output is **Markdown**.
* Assume the reader has **no prior context**.
* Define any non-obvious terms, inputs, or boundaries the reader needs to use the artifact correctly.

Practical tactic:

* Add a short "Overview" that states purpose + audience + constraints in 2–4 sentences.
* Then move immediately into the workflow.

---

## 10) Make sections build on each other (avoid unnecessary repetition)

A good structure minimizes re-stating the same content in slightly different words.

Guidance:

* Put the "core idea" once (early).
* Later sections should add new decisions, edge cases, or validations—not rephrase the overview.
* If you need the reader to recall something, link back ("See: Quality bar") instead of repeating it.

**Anti-pattern: "Quick Start" / "TL;DR" / "Recap" sections**

Do NOT add sections that summarize or repeat the workflow in condensed form. These include:
- "Quick Start (Experienced Users)"
- "TL;DR"
- "Summary" or "Recap" sections
- "At a Glance" duplicates of the workflow

Why this is harmful:
- Consumes context tokens without adding new information
- Creates maintenance burden (two places to update)
- Risks divergence between summary and detail
- Undermines the "one strong path" principle

If the workflow overview feels too long, the solution is to **shorten the workflow**, not to add a summary of it. A brief numbered list at the start (like "Workflow Overview: 1. X, 2. Y, 3. Z") is sufficient—don't duplicate it with a "quick start" that adds slightly more detail.

---

## 11) Weave "why" context only where it prevents bad judgment calls

A little context can prevent an agent (or human) from following steps mechanically in the wrong situation.

Good "why" is:

* short (one clause or one sentence)
* placed next to the rule it explains
* tied to a concrete failure mode

Avoid:

* long motivation essays
* duplicating rationale across multiple sections

---

## 12) Mirror the user's terminology and level of certainty

To preserve intent:

* Reuse the user's key nouns/verbs when they add clarity.
* Match modality:

  * "must / never" → enforce with MUST/NEVER language + validation if applicable
  * "generally / typically" → express as defaults + exceptions

---

## 13) When inputs include messy/unstructured artifacts, add a triage step

Unstructured inputs (notes, logs, transcripts, tool outputs) can be incomplete, outdated, or irrelevant.

Add an explicit step such as:

1. Skim and identify candidate relevant sections
2. Extract only what supports the task's scope and success criteria
3. Ignore the rest unless the user asks otherwise
4. When asserting something important, cite evidence (e.g., file:line or snippet) when possible

---

## 14) Write instructions that pass the interpretation test

When writing each instruction, ensure it survives these questions:

1. **Could this be read two ways?** — If yes, add a clarifying example or explicit constraint before moving on.
2. **Does this assume context the reader won't have?** — Skills should be standalone; make implicit assumptions explicit as you write.
3. **Would a different agent interpret this the same way?** — Consider different models, tool environments, first-time vs experienced users. If interpretation could vary, tighten the language now.

Don't draft loosely and fix later — get it right as you write. An explicit "do X, not Y" or a short example is usually enough to eliminate ambiguity.

---

## 15) Embed checks into actions, not after them

When writing instructions, phrase checks as part of the action — not as separate reflection steps.

**Why:** Agents process instructions sequentially (since they are feed-forward systems). "Pause and reflect" steps are fragile — they may be skipped, rushed, or treated as checkboxes.

**Retroactive (fragile):**
```
1. Write the frontmatter
2. Write the workflow
3. Review your work to ensure frontmatter has name + description
```

**Operationalized (robust):**
```
1. Write frontmatter that includes:
   - [ ] `name`: short, hyphen-case
   - [ ] `description`: what + when + triggers
   Verify these are present before moving on.
2. Write the workflow
```

**When catch-all checks are appropriate:**
- Final self-checks that serve as safety nets (not the primary enforcement mechanism)
- Drift detection that inherently requires before/after comparison
- Anti-pattern lists (reinforcement, not execution)

---

## 16) Write durable content (hedge platform-specific details)

Skills often reference platform-specific details (model names, tool names, config fields, agent types). These can become stale when the platform evolves.

**Decision logic:**

```
1. Is this a CONCEPT or an IMPLEMENTATION DETAIL?
   → Concept (design pattern, workflow shape, invariant): write definitively
   → Implementation detail: continue to step 2

2. Is it ESSENTIAL to include?
   → No: omit, or say "check [source] for current options"
   → Yes: continue to step 3

3. Apply the HEDGING PATTERN:
   - Temporal marker: "as of [date/version]"
   - Discovery hint: "check X for current values"
   - Evolution note: "may change with releases"
```

**Fragile content types to watch for:**
- Enumerated lists (model names, tool names, agent types, permission modes)
- Config schema (frontmatter fields and their allowed values)
- File paths/locations (where platform components live)
- Version-specific behaviors or quirks

**Example:**

Fragile:
```md
Built-in agents: Explore, Plan, general-purpose
```

Durable:
```md
Built-in agents (examples as of early 2026): Explore, Plan, general-purpose
Note: These evolve with releases. Check current availability via Task tool documentation.
```

**When hedging is NOT needed:** Design patterns, workflow shapes, and principles don't require temporal markers — only enumerations and config specifics do.

---

## 17) Surface operating assumptions explicitly

When a skill depends on external tools, platform capabilities, a specific workflow model, or user intent beyond what's captured as inputs — make those assumptions explicit.

For each assumption, classify it:

| Classification | What to write |
|---|---|
| **Hard requirement** | Fail early with a clear message. Document the requirement. |
| **Adaptable** | Write an adaptation path: substitute an alternative, skip and document the gap, provide a fallback chain, or accept a parameter override. |
| **Intentional** | State the assumption explicitly as deliberate scope — not everything should degrade. |

**Why this matters:** Implicit assumptions are invisible until the skill runs in a different context (different machine, container, CI, different user intent). Surfacing them during design prevents silent failures and costly retroactive audits.

When applicable, load `references/assumptions-and-adaptability.md` for the full taxonomy (five categories, four adaptation patterns, resolution order).

---

## 18) Messages carry substance, not mechanics

Messages to the conversational counterpart should contain what they need to understand, decide, or act on — not operational details of what the agent did to get there.

**Fragile:**
> I read auth.ts, then ran grep for "session", then read middleware.ts. I found three security concerns.

**Robust:**
> Three security concerns in the auth flow: (1) session tokens aren't rotated after privilege escalation, (2) ...

The counterpart cares about *what was found* and *what needs their input*. Tool calls, file reads, and search mechanics are operational noise that wastes attention (if human) or context budget (if agent).

This applies when there IS an engaged counterpart. For async/trigger-based skills with no message channel, or background knowledge skills, this pattern is moot.

---

## 19) Visibility is a design choice

When a skill produces artifacts, the skill author should explicitly decide the visibility level for each artifact type relative to each stakeholder. Without intentional design, artifacts land at whatever visibility level is most convenient for the agent — which may not match what stakeholders need.

For each artifact the skill creates, decide:
- **Who is this for?** (the invoker right now? a future session of this skill? an auditor?)
- **Will they know to look for it?** (is the path predictable? is it referenced in messages?)
- **What visibility level?** High (expected deliverable at a known path), medium (accessible if they look), low (agent-internal working state)

Common failure modes:
- **Too visible:** invoker sees operational artifacts they don't need (scratch files, intermediate state cluttering their workspace)
- **Not visible enough:** future sessions can't find evidence they need; auditors can't trace decisions back to their justification
