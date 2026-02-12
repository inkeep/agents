Use when: Writing agent prompts; selecting which failure modes to guard against for a specific agent type
Priority: P1
Impact: Agents without explicit failure mode guidance exhibit predictable LLM blind spots; reduced judgment quality

---

# Failure Modes

LLMs have systematic failure modes — predictable ways they deviate from skilled human judgment. Good agent prompts explicitly name the failure modes most relevant to the task, giving the agent self-correction targets.

This is the difference between "what to do" and "what to watch out for."

---

## How to use this catalog

1. Review the failure modes below
2. Identify the **3-5 most likely** given your agent's task and scope
3. Include them in the agent prompt — either:
   - As a dedicated **"Failure modes to avoid"** section (explicit, scannable), OR
   - Woven into **operating principles** ("Do X. Avoid the tendency to Y.")
4. Frame as specific, observable behaviors — not vague admonitions

Don't include all of them. Selecting the relevant subset focuses attention where it matters.

---

## The catalog

### 1. Plowing through ambiguity

**What it looks like:** Makes silent assumptions, fills gaps with defaults, never surfaces "I'm unclear on X." Proceeds confidently when it should pause.

**The human instinct it lacks:** Recognizing ambiguity or underspecification and clarifying before proceeding.

**Guard against it:**
- "If instructions are ambiguous or underspecified, surface what's unclear and ask — don't fill gaps silently."
- "State assumptions explicitly when you make them. Prefer asking over assuming when stakes are non-trivial."

**Most relevant for:** Implementers, orchestrators, any agent with significant autonomy.

---

### 2. Flattening nuance in sources

**What it looks like:** Treats ambiguous or conflicting content as definitive. Picks one interpretation and runs with it without acknowledging alternatives or tensions.

**The human instinct it lacks:** Balanced interpretation; acknowledging that sources may be ambiguous, incomplete, or in tension with each other.

**Guard against it:**
- "When sources conflict or are ambiguous, note the tension rather than silently picking one interpretation."
- "Distinguish what a source clearly states from what you're inferring or extrapolating."

**Most relevant for:** Researchers, reviewers, any agent synthesizing information from multiple sources.

---

### 3. Treating all sources as equally authoritative

**What it looks like:** Fails to weigh credibility, recency, or contextual fit. Applies information out of domain. Treats a blog comment the same as official documentation.

**The human instinct it lacks:** Evaluating source authority, applicability to the current situation, and domain fit.

**Guard against it:**
- "Weigh sources by authority and relevance: official docs > established patterns in this codebase > examples > blog posts > guesses."
- "Note when you're applying information outside its original context or domain."

**Most relevant for:** Researchers, implementers working with external references.

---

### 4. Acting without modeling downstream effects

**What it looks like:** Misses edge cases. Fails to anticipate how an action or recommendation could backfire, conflict with other constraints, or cause unintended consequences.

**The human instinct it lacks:** Thinking through "what could go wrong" and "what else does this affect" before acting.

**Guard against it:**
- "Before making a change or recommendation, consider: what could this break? What edge cases exist? What constraints might this conflict with?"
- "If an action has non-obvious downstream consequences, name them explicitly."

**Most relevant for:** Implementers, orchestrators, any agent that modifies state or makes recommendations.

---

### 5. Confabulating past knowledge limits

**What it looks like:** Generates plausible-sounding answers when the honest response is "I don't know" or "I'm not confident." Fills knowledge gaps with fabrication rather than acknowledging uncertainty.

**The human instinct it lacks:** Knowing when you've hit a limitation of your knowledge and being honest about it.

**Guard against it:**
- "If you don't know or aren't confident, say so. 'I don't know' and 'I'm not certain about this' are valid responses."
- "Don't invent details to fill gaps. Flag what you'd need to verify."

**Most relevant for:** All agents, especially those answering questions or making factual claims.

---

### 6. Never escalating or deferring

**What it looks like:** Always produces an answer or takes an action rather than flagging "this needs human judgment" or "I'm not confident enough to proceed here."

**The human instinct it lacks:** Knowing when to escalate, defer, or bring in someone with more context or authority.

**Guard against it:**
- "If a decision is outside your scope, confidence level, or competence, say so and recommend escalation rather than guessing."
- "It's better to flag uncertainty than to proceed and cause harm or waste effort."

**Most relevant for:** Agents with autonomy to act; orchestrators making dispatch decisions.

---

### 7. Treating all instructions as equally rigid

**What it looks like:** Fails to distinguish hard requirements from soft guidance. Either over-complies (treats suggestions as mandates) or over-interprets (treats mandates as flexible).

**The human instinct it lacks:** Parsing directive strength — knowing what's non-negotiable vs. what's guidance vs. what's a suggestion.

**Guard against it:**
- "Distinguish 'must' (non-negotiable) from 'should' (strong default, exceptions possible) from 'consider' (suggestion, use judgment)."
- "If something says 'consider X,' you can decide not to do X with good reason. If something says 'always X,' you cannot skip it."

**Most relevant for:** All agents following instructions, standards, or guidelines.

---

### 8. Assuming intent instead of probing

**What it looks like:** Projects a goal onto the user/requester rather than understanding their actual world-model, intent, and constraints. Fills in "what they probably want" without checking.

**The human instinct it lacks:** Working with others to understand their mental model, goals, and the nuance of what they actually want.

**Guard against it:**
- "Don't assume you know what they want. If intent is unclear or could be interpreted multiple ways, ask."
- "When in doubt, restate your understanding of the goal and verify it matches theirs before proceeding."

**Most relevant for:** Agents interacting with users; orchestrators interpreting requests.

---

### 9. Asserting confidently when uncertain

**What it looks like:** Gives a single answer or takes a single path when multiple valid options exist. Under-hedges when the situation warrants presenting alternatives or pausing for input.

**The human instinct it lacks:** Calibrating confidence to actual certainty; presenting options when genuinely uncertain rather than picking arbitrarily.

**Guard against it:**
- "When multiple valid approaches exist, present them with tradeoffs rather than silently picking one."
- "Match your expressed confidence to your actual certainty. Don't assert what you're genuinely unsure about."

**Most relevant for:** Advisors, planners, any agent making recommendations or decisions.

---

### 10. Padding, repeating, and burying the lede

**What it looks like:** Restates points in slightly different words. Adds filler phrases. Scatters key details instead of surfacing them clearly. Optimizes for apparent completeness over actual usefulness. Produces output without considering what the reader actually needs to take away.

**The human instinct it lacks:** Writing with a theory of mind — progressive, non-repetitive, focused on what the reader needs to learn or act on.

**Guard against it:**
- "State each point once, clearly. Don't rephrase the same idea in multiple places."
- "Lead with the most important information. Structure output for the reader's needs, not for completeness."
- "Before finalizing output, ask: what does the reader need to take away? Is that clear and prominent?"

**Most relevant for:** All agents producing written output; especially summarizers, reporters, advisors.

---

### 11. Over-indexing on recency

**What it looks like:** Treats the latest input as overriding all prior context. Makes disproportionate adjustments based on recent feedback without weighing it against original intent, established decisions, or conversation history. Loses the thread of what was already agreed upon.

**The human instinct it lacks:** Evaluating new inputs proportionally and contextually; maintaining awareness of full history and original intent.

**Guard against it:**
- "New input is additional context, not a reset. Weigh it against what's already been established."
- "If new feedback contradicts earlier guidance or decisions, surface the tension rather than silently overriding."
- "Maintain the thread: what was the original intent? What's been agreed? How does this new input fit with that?"

**Most relevant for:** Agents in multi-turn interactions; orchestrators managing iteration and feedback loops.

---

### 12. Clarification loop paralysis

**What it looks like:** Asks too many questions before acting. Seeks permission or clarification for decisions that are low-stakes, reversible, or well within scope. Creates friction by over-asking when sensible defaults exist.

**The human instinct it lacks:** Judging when to ask vs when to proceed with reasonable assumptions. Understanding that some decisions don't warrant clarification overhead.

**Guard against it:**
- "For low-stakes, reversible decisions, proceed with sensible defaults and label your assumptions. Don't ask permission for every choice."
- "Ask only when: (1) the decision materially affects the outcome, (2) multiple valid approaches exist with different tradeoffs, or (3) the user's preference is genuinely unclear and stakes are non-trivial."
- "If you'd ask more than 1-3 targeted questions, consider whether you're over-asking."

**Most relevant for:** All agents, especially those with broad autonomy or user-facing interactions.

---

### 13. Silent assumption cascade

**What it looks like:** Makes a chain of assumptions without surfacing any of them. Each assumption builds on the previous, leading to outputs that are coherent but based on premises the user never agreed to.

**The human instinct it lacks:** Making assumptions visible so they can be challenged. Recognizing when accumulated assumptions have compounded enough to warrant a check-in.

**Guard against it:**
- "When you make assumptions, state them explicitly: 'Assuming X, I will Y.'"
- "If you've made multiple assumptions in a row, pause and surface them before proceeding further."
- "Don't let implicit decisions compound. The user should be able to trace how you got from their request to your output."

**Most relevant for:** Implementers, planners, any agent with autonomy to interpret and act on requests.

---

## Quick reference: Failure modes by agent type

Use this table to quickly identify which failure modes are most relevant:

| Agent type | Commonly relevant failure modes |
|---|---|
| **Reviewer** | #2 Flattening nuance, #3 Source authority, #9 Asserting when uncertain, #10 Padding/burying lede |
| **Implementer** | #1 Plowing through ambiguity, #4 Downstream effects, #7 Instruction rigidity, #8 Assuming intent, #13 Silent assumption cascade |
| **Researcher** | #2 Flattening nuance, #3 Source authority, #5 Confabulating, #10 Padding/burying lede |
| **Orchestrator** | #1 Plowing through ambiguity, #6 Never escalating, #8 Assuming intent, #11 Over-indexing on recency |
| **Advisor/Planner** | #4 Downstream effects, #5 Confabulating, #8 Assuming intent, #9 Asserting when uncertain, #13 Silent assumption cascade |
| **User-facing agent** | #8 Assuming intent, #12 Clarification loop paralysis, #13 Silent assumption cascade |

---

## Integrating failure modes into agent prompts

### Option A: Dedicated section

Add a "Failure modes to avoid" section in the agent prompt:

```markdown
# Failure modes to avoid

- **Plowing through ambiguity:** Don't fill gaps with silent assumptions. If requirements or context are unclear, surface what's missing and ask.
- **Flattening nuance:** Don't treat conflicting or ambiguous sources as definitive. Acknowledge tensions and uncertainties.
- **Padding and burying the lede:** Don't rephrase the same point multiple ways. Lead with what matters most; cut filler.
```

### Option B: Woven into operating principles

Integrate failure mode awareness into the operating principles section:

```markdown
# Operating principles

- Clarify before proceeding: if instructions or context are ambiguous, surface what's unclear rather than filling gaps with assumptions.
- Weigh sources appropriately: official docs and established patterns take precedence over examples, comments, or inferred conventions. Note when sources conflict.
- Model downstream effects: before making a change, consider what it could break, what edge cases exist, and what constraints it might conflict with.
- Match confidence to certainty: if multiple valid approaches exist, present them with tradeoffs rather than silently picking one.
- Write for the reader: lead with key findings; state each point once; structure for takeaways, not completeness.
```

### Option C: Hybrid

Use operating principles for the positive framing, then add a brief "watch out for" callout:

```markdown
# Operating principles
...

**Watch out for:** silent assumptions when context is unclear; flattening nuance in ambiguous sources; burying key findings in verbose output.
```

---

## The pattern: why this works

Naming failure modes explicitly works because:

1. **Self-correction targets:** The agent knows what to watch for, not just what to do
2. **Concrete behaviors:** "Don't fill gaps silently" is actionable; "be careful" is not
3. **Contextual relevance:** Selecting the right 3-5 focuses attention where it matters
4. **Matches human training:** Skilled humans learn "here's how people mess this up" alongside "here's how to do it"

The goal isn't an exhaustive list of don'ts — it's calibrating judgment by naming the specific failure modes most likely to occur in this agent's context.
