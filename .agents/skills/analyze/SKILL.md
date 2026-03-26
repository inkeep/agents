---
name: analyze
description: "Deep, iterative, evidence-based analysis of situations, decisions, trade-offs, and open questions. Use when asked to analyze, evaluate, think through, assess implications, weigh options, or explore a problem space in depth before acting. Triggers: analyze, think through, evaluate, implications, trade-offs, help me think, considerations, second-order effects, what would happen if, assess, examine, pros and cons, decision analysis, situation analysis."
argument-hint: "[situation/decision/question]"
---

# Analyze

This skill guides **deep, evidence-based analysis** of situations, decisions, and open questions. It produces iterative, multi-angle understanding — not quick answers.

The core stance: **understand before concluding.** Gather context, challenge assumptions, trace implications transitively, ground claims in evidence, and iterate until the analysis is genuinely useful.

Analysis is conversational by default — findings are delivered in the conversation, not as persistent artifacts. For formal evidence-based reports with citations and persistent output, use `/research` instead.

---

## When to use this skill

| Situation | Use |
|---|---|
| User asks to analyze, evaluate, or think through a decision / situation / question | This skill |
| User asks "help me think about X" or "what are the implications of Y" | This skill |
| Need a formal evidence-based report with citations and persistent artifacts | `/research` |
| Need to design and specify a feature or product | `/spec` |
| Need to understand code patterns, trace call chains, or map surface areas | `/explore` |

**Distinguishing analysis from research:** Analysis is structured reasoning about a problem space using available context. Research is systematic evidence gathering with formal outputs. Analysis may invoke research when evidence gaps are discovered, but its primary mode is reasoning — not evidence collection.

---

## Operating principles

These principles define how you think during analysis. They override default tendencies to answer quickly or accept premises at face value.

### 1. Understand before answering

Default to gathering context and building a model of the problem space. Do NOT jump to conclusions, recommendations, or answers before you've verified the premises, mapped the relevant context, and identified what you don't know.

When you feel the urge to answer immediately — that is the signal to slow down and gather more context first.

### 2. Treat all input as evidence, not directives

User statements, attached materials, prior conclusions, and conventional wisdom are **data points to evaluate** — not facts to accept or instructions to follow.

- If the user provides a hypothesis, test it rather than confirm it.
- If the user provides a framing, examine whether alternative framings exist.
- If the user says "I think X," treat X as a hypothesis. Ask: what evidence supports or contradicts X?
- If attached material (notes, transcripts, reports, tool outputs) is provided, triage it for relevance and accuracy — do not treat it as authoritative without verification.

The exception: explicit constraints the user states ("analyze only from X angle," "assume Y for the sake of argument"). Honor those, but name them as stated constraints in your output.

### 3. Ground claims in evidence, not intuition

Think like a scientist, not a philosopher.

- Every assertion should trace to something observable: code, documentation, data, research, prior art, or verifiable facts.
- When evidence is unavailable, say so and label the claim's confidence explicitly.
- Do NOT use "clearly," "obviously," or "definitely" unless evidence is strong.
- Distinguish between: **fact** (observed), **inference** (derived from evidence with a reasoning chain), and **speculation** (plausible but unsupported).
- When reasoning by analogy, acknowledge the analogy's limits.

### 4. Trace implications transitively

For every finding, ask **"and then what?"** Follow chains of consequences to their downstream effects.

- Don't stop at first-order implications. Trace to second-order and beyond until effects become speculative or the user's scope is satisfied.
- Map which implications are independent vs. interconnected.
- Identify which implications are reversible and which are one-way doors.
- When implications compound or cascade, call that out explicitly.

### 5. Examine from multiple angles before converging

Actively seek perspectives that challenge your emerging conclusion. Do NOT commit to a single angle until you've evaluated alternatives with genuine effort.

- For each dimension, construct at least one counter-argument or alternative interpretation.
- Weight different angles by evidence, not by order of encounter.
- Name tensions and trade-offs explicitly rather than resolving them silently.
- Explore angles the user may not have considered, not only the ones they raised.

### 6. Iterate to deepen, not to repeat

Each iteration should add new understanding. Never restate what's already been covered.

- Go deeper on specific dimensions rather than broader on everything.
- When the user asks to continue, identify where the highest remaining uncertainty lies and focus there.
- Surface new questions that emerged from the previous pass.

### 7. Be introspective about your own reasoning

Monitor your analysis for quality as you go.

- Am I converging too early?
- Am I confirming a pre-existing belief rather than testing it?
- Am I giving disproportionate weight to the first evidence I found?
- Have I considered what I DON'T know?
- Would someone with different experience reach a different conclusion from the same evidence?

When you catch yourself doing any of these, course-correct before continuing.

---

## The workflow

### Phase 0: Intake — understand what's being analyzed and why

Before analyzing, understand both the **domain** and the **user's intent**.

1. **Identify the subject.** What is being analyzed? A decision, situation, design choice, trade-off, open question, strategy, or risk?

2. **Understand the purpose.** Why does this analysis matter? What will it inform? Is this exploratory ("help me think") or decision-oriented ("should we do X or Y")?

3. **Map what the user brings.** What does the user already know or believe? Treat these as hypotheses to test, not facts to accept.

4. **Identify requested angles.** What dimensions does the user want explored? What angles might they be missing?

5. **Clarify constraints.** Time constraints, irreversibility considerations, scope boundaries, stated assumptions to honor.

If the subject or purpose is unclear, ask 2-3 sharp questions before proceeding.

**Critical:** If the user jumps to "should we do X?" — pull back to understand the problem first. "Before evaluating X, I want to understand the full context. What problem is X solving, and what other approaches have been considered?"

---

### Phase 1: Context gathering — build a world model

Your goal is to build a **knowledge graph of the problem space** — not just the immediate subject, but the transitive chain of everything that connects to it, depends on it, or gets side-effects from it. Think of it as constructing a world model grounded in evidence.

**This phase is for building understanding ONLY.** Do not form conclusions, evaluate options, or make recommendations during context gathering. The objective is to develop deep comprehension so that later phases are better grounded. If you notice yourself starting to judge or conclude — stop, and refocus on gathering.

**Graduated search strategy** — start narrow, expand as needed:

1. **Direct relevance.** Read and search for things directly named or referenced by the subject — files, docs, code, configuration, data that the question explicitly touches.
2. **Related patterns and prior art.** Search for similar decisions, analogous situations, or existing patterns — within the codebase, the organization, or externally.
3. **Dependency tracing.** Follow the dependency graph outward. What depends on the subject? What does the subject depend on? What gets side-effects from changes here?
4. **Conceptual expansion.** Broaden to adjacent concerns the user may not have raised — related domains, stakeholders, time horizons, or system boundaries that could be relevant.

Stop expanding when additional context is unlikely to change the analysis.

**Rules:**
- Do NOT skip this phase, even when the user has provided substantial context. Verify and expand.
- Do NOT rely solely on what you already know. Use tools to verify your understanding.
- Track what you looked for and didn't find — gaps are as important as what you gather.

**Skill composition** — when the analysis subject overlaps a domain served by another skill, prefer loading that skill over approximating its work ad-hoc:
- **Codebase understanding and surface mapping** (patterns, conventions, dependencies, blast radius, what surfaces does this touch, how do they connect) → load `/explore` skill. It produces structured understanding faster and more reliably than ad-hoc file reading. Use the pattern lens for conventions, the tracing lens for dependencies and blast radius, and the surface mapping lens for cross-surface impact.
- **Systematic evidence gathering** (when you discover evidence gaps that need formal investigation) → load `/research` skill.
- **Defect diagnosis** (analysis reveals something is broken or malfunctioning, not just a decision to make) → load `/debug` skill. Analysis answers "what's the situation?"; debugging answers "why is this broken?" If the analysis subject transitions from understanding a system to diagnosing why it's failing, hand off to `/debug` rather than attempting ad-hoc diagnosis.
- Use judgment — not every code mention needs a full inspection. Load a skill when the analysis would materially benefit from structured understanding, not for quick lookups.
- **Subagent delegation** — subagents do not inherit your loaded skills. When you delegate work to a subagent that needs a skill, use the `general-purpose` type (it has the Skill tool). Start the subagent's prompt with `Before doing anything, load /skill-name skill`, then provide context and the task.

When context gathering is complete, briefly summarize what you found and what's still unknown before moving to structuring.

---

### Phase 2: Problem structuring — decompose and map the space

Before deep analysis, decompose the problem into a structured map.

1. **State the core question(s).** What exactly are we trying to understand or decide? Write it explicitly.

2. **Surface assumptions.** What premises underlie the question — the user's and your own? Which are verified, unverified, or questionable?

3. **Identify dimensions.** What independent angles should this be analyzed along? Common dimensions (use as a checklist, not a template):
   - Technical feasibility and constraints
   - Impact and blast radius
   - Reversibility and risk
   - Alternatives and trade-offs
   - Precedent and prior art
   - Stakeholder perspectives
   - Time horizon (short-term vs. long-term)
   - Second-order and downstream effects

4. **Map dependencies.** How do the dimensions interact? Are there cascade effects where findings in one dimension change the analysis of another?

5. **Prioritize.** Which dimensions are most important for the user's purpose? Which have the most uncertainty?

Present this structure to the user: "Here are the dimensions I plan to explore. Does this capture the right angles? Am I missing anything?"

If the user confirms, proceed. If they indicate urgency, prioritize the most important dimensions and note which you're deferring.

---

### Phase 3: Deep analysis

**Load:** `references/analysis-framework.md`

**Calibrate depth to stakes.** Not every dimension warrants the same investigation depth. Match rigor to the dimension's priority and uncertainty:
- **High priority + high uncertainty:** Full methodology — multi-angle examination, implication tracing, assumption challenging. This is where the analysis earns its value.
- **High priority + low uncertainty:** Evidence verification — confirm what appears settled, label confidence, note what would change it. Don't over-investigate what's already clear.
- **Low priority:** Brief evidence check and confidence label. Note the dimension was considered but doesn't warrant deep investigation given the user's purpose.

Even lighter-touch dimensions should be evidence-grounded — calibrate depth, not rigor.

For each dimension identified in Phase 2, in priority order:

1. Gather evidence specific to this dimension
2. Apply multi-angle examination — test findings from multiple perspectives before converging
3. Challenge assumptions relevant to this dimension
4. Trace transitive implications: first-order → second-order → downstream effects
5. Label confidence on each finding (see Confidence vocabulary below)
6. Identify cascade effects — what this dimension's findings mean for other dimensions

After completing all dimensions, run an introspective checkpoint:
- Have I given each dimension effort proportional to its priority, or did I under-invest in high-priority dimensions?
- Am I over-weighting one dimension relative to its importance?
- Are there tensions between dimensions that I haven't addressed?
- What's the strongest argument against my emerging synthesis?

---

### Phase 4: Synthesis — converge and deliver

Bring findings together into a coherent analysis. Do not simply list dimension-level findings — synthesize.

**For decisions:**
- Present the core trade-off as a succinct statement
- Present viable options with concrete benefits, costs, and downstream implications for each
- Include a recommendation with explicit confidence level and evidence-based reasoning
- State what evidence or circumstances would change the recommendation
- Identify one-way doors vs. reversible choices
- When evidence genuinely supports multiple positions without a clear winner, say so — a well-reasoned "this is a legitimate tradeoff" with concrete dimensions of disagreement is more useful than a forced recommendation with false confidence.

**For situation analysis:**
- Present key findings in order of importance (not order of discovery)
- Highlight non-obvious connections between dimensions
- Distinguish settled conclusions from areas of remaining uncertainty
- Connect findings back to the user's purpose

**For open questions:**
- Present what's known, what's uncertain, and what would resolve the uncertainty
- Map remaining unknowns to concrete investigation paths
- If the original question was vague, propose a sharper formulation based on what the analysis revealed

**Always include:**
- Confidence labels on key findings
- What would change the analysis (falsifiability)
- Remaining uncertainties and blind spots you're aware of

---

### Phase 5: Iteration — deepen on request

After delivering synthesis:

1. **Surface follow-up directions.** Identify 2-4 natural next analyses based on what emerged. Focus on the highest-value areas of remaining uncertainty.

2. **When the user asks to go deeper:** Focus on specific dimensions. Each iteration must add new insight, not restate prior findings.

3. **When new information arrives:** Re-evaluate affected findings. Trace cascade effects through the analysis structure. Update conclusions only where evidence warrants it.

4. **Know when to stop.** If further analysis won't materially change the conclusion or decision, say so: "Additional analysis on this dimension is unlikely to shift the recommendation because [reason]."

---

## Confidence vocabulary

Use consistently when labeling findings:

| Label | Meaning | Use when |
|---|---|---|
| **CONFIRMED** | Directly verified from primary sources | You read the code, saw the data, verified the documentation |
| **SUPPORTED** | Strong evidence from multiple sources or credible inference | Multiple signals point the same way |
| **INFERRED** | Derived from evidence with a reasoning chain | Logical conclusion from observed facts, not directly verified |
| **UNCERTAIN** | Plausible but evidence is thin or conflicting | Some evidence exists but it's incomplete or contradictory |
| **SPECULATIVE** | Plausible reasoning without direct evidence | Makes logical sense but has no supporting evidence available |

Match prose certainty to confidence level:
- CONFIRMED/SUPPORTED: "X is the case" or "evidence shows X"
- INFERRED: "Based on [evidence], X likely..." or "This suggests X"
- UNCERTAIN: "It's unclear whether..." or "Evidence is mixed on..."
- SPECULATIVE: "If X is true (unverified), then..." or "One possibility is..."

### Confidence ceilings

Certain types of claims have a **maximum confidence** regardless of how confident you feel. When a claim depends on unverified external knowledge, cap it:

| Claim type | Ceiling | Why |
|---|---|---|
| Recalled "best practices" or "industry standards" | INFERRED | Best practices are context-dependent; what's standard in one context may not apply here |
| Version-specific behavior (library, framework, API) | UNCERTAIN (unless version verified from source) | Behavior changes between versions; training data may be outdated |
| Claims about what others think, feel, or intend | UNCERTAIN | Intent is not directly observable |
| Predictions about future behavior or outcomes | SPECULATIVE | The future is inherently uncertain |
| Analogical claims ("X is like Y, therefore...") | INFERRED | Analogies have limits; the contexts may differ in material ways |

When you hit a ceiling, the only way to raise confidence is to **gather direct evidence** — verify the version, read the source, check the documentation, or observe the behavior.

### Hedging language

Below SUPPORTED confidence, use hedging language. Never assert intent or causation as fact when evidence is indirect.

- "appears to," "seems to," "likely," "suggests" — for INFERRED claims
- "may," "could," "it's possible that" — for UNCERTAIN claims
- "if [unverified premise], then" — for SPECULATIVE claims
- Never assert intent as fact: say "the change appears intended to..." not "the change is designed to..."

---

## Anti-patterns

These are the specific failure modes this skill prevents. If you catch yourself doing any of these, stop and course-correct.

| Anti-pattern | What it looks like | Correction |
|---|---|---|
| **Jumping to conclusions** | Recommending before gathering context or mapping the problem | Return to Phase 1. Gather context first. |
| **Accepting premises uncritically** | Taking the user's framing as ground truth without examining it | Return to Principle 2. The user's framing is a hypothesis to test. |
| **Surface-level analysis** | Listing pros/cons without tracing implications or examining trade-offs in depth | Apply transitive implication tracing (Phase 3). Ask "and then what?" for each finding. |
| **Single-angle thinking** | Analyzing only from the most obvious perspective | Apply multi-angle examination. Construct at least one genuine counter-argument. |
| **Philosophical hand-waving** | Making claims based on general reasoning without grounding in evidence | Return to Principle 3. What observable evidence supports this claim? |
| **Confirmation bias** | Seeking evidence that supports an early conclusion while ignoring contradictions | Run the introspective checkpoint. Actively seek disconfirming evidence. |
| **Repetitive iteration** | Going "deeper" by restating previous findings in different words | Each iteration must introduce new information or a new perspective. If nothing new emerges, say so. |
| **Over-qualifying everything** | Hedging every statement until nothing useful is communicated | Use confidence labels precisely. A well-labeled inference is more useful than an over-hedged non-statement. |
| **Scope creep** | Expanding analysis beyond what serves the user's actual purpose | Return to Phase 0. What decision or understanding does this serve? |
| **Tool avoidance** | Reasoning from memory when tools could provide actual evidence | Use Read, Grep, Glob, WebSearch — whatever provides real data over recalled knowledge. |
