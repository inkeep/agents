Use when: Debugging why an agent underperforms; reviewing your own agent prompts before delivery
Priority: P2
Impact: Without designer self-awareness, you'll blame the model for problems you created

---

# Designer Failure Modes

When an agent underperforms, the instinct is to blame the model. But most failures trace back to **designer errors** — problems in the prompt itself that set the agent up to fail.

This reference helps you catch designer failures before they become runtime problems.

---

## The Core Distinction

| Category | What it means | Fix |
|---|---|---|
| **Designer failure** | The prompt has issues (ambiguity, missing guidance, structural problems) | Edit the prompt |
| **Runtime failure** | The prompt is sound but the model misapplies it | Strengthen emphasis, add examples, or accept limitation |

**Rule of thumb:** If you can imagine a careful human reader misinterpreting the prompt the same way the model did, it's a designer failure.

---

## Common Designer Failure Modes

### 1. Ambiguous instructions

**What it looks like:** Instructions that could be read two ways. The model picks one interpretation; the user expected the other.

**Examples:**
- "Be thorough" — does this mean check everything, or provide detailed output?
- "Clean up the code" — does this mean format, refactor, or delete dead code?
- "Review for issues" — security issues? bugs? style issues? all of the above?

**Fix:** Add clarifying examples, "do X, not Y" constraints, or explicit scope.

---

### 2. Missing context assumptions

**What it looks like:** The prompt assumes context that won't be available at runtime (e.g., relies on parent chat history, assumes files have been read).

**Examples:**
- "Continue from where we left off" — subagents start fresh
- "Apply the pattern we discussed" — what pattern?
- "Fix the issue" — which issue?

**Fix:** Make all necessary context explicit in the prompt or handoff packet. Agent prompts should be standalone.

---

### 3. Vague directive strength

**What it looks like:** Using weak language ("consider", "try to", "be careful") for things that are actually requirements, or vice versa.

**Examples:**
- "Try to run tests" when tests are required
- "Consider security" when security is non-negotiable
- "Must follow style guide" for cosmetic preferences

**Fix:** Match language to actual requirement strength: "must" for hard requirements, "should" for strong defaults, "consider" for suggestions.

---

### 4. Missing failure mode awareness

**What it looks like:** The prompt tells the agent what to do, but not what to watch out for. The agent makes predictable LLM errors because nothing warned it.

**Examples:**
- Reviewer flattens nuance because prompt didn't say to preserve it
- Implementer plows through ambiguity because prompt didn't say to ask
- Agent pads output because prompt didn't set verbosity limits

**Fix:** Include 3-5 contextually relevant failure modes from `references/failure-modes.md`.

---

### 5. Underspecified output contract

**What it looks like:** The prompt doesn't clearly define what "good output" looks like. The agent produces something, but it's not what you needed.

**Examples:**
- "Return your findings" — in what format? how much detail?
- "Summarize the issues" — bullet points? paragraphs? severity levels?
- "Report back" — what structure? what sections?

**Fix:** Define exact headings, severity levels, evidence expectations, and verbosity bounds.

---

### 6. Missing escalation rules

**What it looks like:** The prompt doesn't say when to ask for help vs proceed with assumptions. The agent either asks too much (paralysis) or too little (silent assumptions).

**Examples:**
- No guidance on what to do when blocked
- No clarity on what decisions are in-scope vs need approval
- No fallback for when required info is missing

**Fix:** Add explicit escalation rules: when to ask, when to proceed with assumptions (and label them), when to return partial results.

---

### 7. Overloaded scope

**What it looks like:** The prompt tries to cover too much. The agent can't hold all the instructions in effective attention, so it drops some.

**Examples:**
- 2000+ token prompts with many parallel concerns
- "Do X, and also Y, and also Z, and also..." without prioritization
- Encyclopedic guidance with no clear priority

**Fix:** Prioritize ruthlessly. Move reference material to files loaded on demand. Use "MUST" for critical items and "SHOULD" for nice-to-haves.

---

### 8. False dichotomies

**What it looks like:** The prompt presents two options when more exist, or frames a tradeoff incorrectly.

**Examples:**
- "Either fix the bug or document it" — what about escalating?
- "Be thorough or be fast" — what if both are possible?
- "Ask or assume" — what about proceeding with labeled assumptions?

**Fix:** Ensure decision points reflect actual options. Include escape hatches where appropriate.

---

## The Designer Self-Check

Before delivering an agent prompt, ask:

1. **Could any instruction be read two ways?** If yes, add clarifying examples or constraints.

2. **Does this assume context the agent won't have?** Make implicit assumptions explicit.

3. **Is directive strength clear throughout?** Check that "must"/"should"/"consider" match actual requirements.

4. **Are the relevant failure modes addressed?** Include 3-5 from the catalog.

5. **Is the output contract specific enough?** Could you validate output against it?

6. **Are escalation rules clear?** When to ask, when to proceed, when to return partial results.

7. **Is scope manageable?** Can the agent hold all critical instructions in effective attention?

If any answer is "no," fix before delivering.

---

## Debugging: Designer vs Runtime

When an agent fails, diagnose:

| Question | If "yes" → Designer failure | If "no" → Runtime failure |
|---|---|---|
| Could I imagine a human making this same mistake given the prompt? | Prompt is ambiguous | Model misapplied clear instruction |
| Is the expected behavior explicitly stated? | No → Add it | Yes → Strengthen emphasis |
| Does the agent have enough context to judge this case? | No → Add context | Yes → Add examples |
| Is the instruction competing with many others for attention? | Yes → Prioritize/trim | No → Model limitation |

When in doubt, assume designer failure first. Most problems are fixable by editing the prompt.
