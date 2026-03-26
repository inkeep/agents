Use when: Executing Phase 3 (Deep Analysis) — detailed methodology for multi-angle examination, implication tracing, and assumption challenging
Priority: P0
Impact: Analysis stays shallow; implications not traced; assumptions not challenged; conclusions lack rigor

---

# Analysis Framework

This reference contains the detailed methodology for Phase 3 of the analysis workflow. It describes how to examine each dimension with rigor — not just "think about it" but how to think about it systematically.

---

## Multi-angle examination protocol

For each dimension, before forming a conclusion:

1. **State your emerging finding.** Write it as a clear claim: "Based on what I've gathered, X appears to be the case because Y."

2. **Construct a genuine counter-argument.** Not a strawman — a real alternative that a reasonable person with different priors might hold. Ask:
   - What would someone who disagrees say?
   - What evidence would support the opposite conclusion?
   - What context or experience would lead to a different interpretation?

3. **Evaluate the counter-argument honestly.** Does evidence support it? Is it more than hypothetical?
   - If the counter-argument has supporting evidence → you have a **tension** to resolve or present as a trade-off.
   - If the counter-argument is purely hypothetical → note it as a risk but proceed with your finding.

4. **Check for missing angles.** Beyond "for / against," consider:
   - **Different stakeholders:** Who else is affected? Who would see this differently?
   - **Different time horizons:** What's true short-term vs. long-term?
   - **Different scopes:** What's true locally vs. systemically?
   - **Different risk tolerances:** Conservative vs. aggressive interpretation?

5. **Converge only when you've genuinely tested alternatives.** If you find yourself dismissing every counter-argument quickly, slow down — you may be anchored.

---

## Transitive implication tracing

For each finding or potential change, trace the chain of consequences systematically.

### The method

```
Finding → First-order effects → Second-order effects → Downstream effects
```

At each level:

1. **Enumerate direct effects.** What changes immediately as a result of this finding? Be concrete — name the specific things that change, not abstract categories.

2. **For each direct effect, ask "and then what?"**
   - What does this effect cause? What depends on it?
   - Who or what is affected by this change?
   - Does this create new constraints, opportunities, or risks?

3. **Map dependencies between effects.** Classify each relationship:
   - **Independent:** Changing one doesn't affect the other
   - **Coupled:** They amplify or counteract each other
   - **Cascading:** A causes B causes C

4. **Label each level:**
   - **Reversibility:** Can this effect be undone? At what cost?
   - **Blast radius:** How many things does this touch?
   - **Confidence:** How certain is it that this effect follows? (Effects further down the chain are naturally lower confidence.)

5. **Stop tracing when:**
   - Effects become too speculative to be useful (confidence drops below UNCERTAIN)
   - You've reached the boundary of the user's stated scope
   - Further tracing wouldn't change the analysis or decision

### Gap-finding: what's potentially unaccounted?

After forward-tracing implications, reverse the question: **what SHOULD be affected by these findings but hasn't been considered?**

1. Review the full set of implications you've traced.
2. For each significant implication, ask: "Is there anything that depends on this, consumes this, or is downstream of this that I haven't examined?"
3. Compare your traced implications against the dimensions from Phase 2. Are there dimensions your implication chains should touch but don't?
4. Flag anything that appears in the transitive chain but hasn't been examined as **potentially unaccounted** — it may need analysis, or at minimum a conscious acknowledgment that it was considered and deemed out of scope.

This catches blind spots that forward-only tracing misses. Forward tracing follows what you see; gap-finding looks for what you don't see.

### Implication categories to check

Not every category applies to every analysis. Use as a checklist of angles that are easy to miss:

- **Incentive effects:** Does this change what people are motivated to do?
- **Precedent effects:** Does this establish a pattern that will be expected in the future?
- **Constraint effects:** Does this close off options that were previously available?
- **Resource effects:** Does this consume, free, or redirect resources (time, money, attention)?
- **Information effects:** Does this reveal, obscure, or change what's known?
- **Timing effects:** Does this create urgency, remove urgency, or shift timelines?
- **Trust effects:** Does this build, erode, or transfer trust?
- **Reversibility effects:** Does this make future changes easier or harder?

---

## Assumption surfacing and challenging

Assumptions are load-bearing premises that are invisible until examined. This protocol makes them visible.

### Where assumptions hide

1. **In the question itself.** "Should we do X?" assumes X is feasible, desirable, and the right scope.
2. **In the user's framing.** The way a question is phrased implies priorities, constraints, and context that may not be accurate.
3. **In your own knowledge.** You bring priors about how things work, what's common, and what's "best practice" — these may not apply here.
4. **In attached materials.** Documents, notes, and prior analyses contain their own assumptions, which may be outdated or wrong.
5. **In conventional wisdom.** "Best practices" and "industry standards" are assumptions about what works — they have contexts where they don't apply.

### The surfacing process

1. **Identify.** For each major claim or premise in the analysis, ask: "What must be true for this to hold?" Write these out explicitly.

2. **Classify each assumption:**

   | Classification | Evidence status | Action |
   |---|---|---|
   | **Verified** | Confirmed by primary evidence | Proceed — note the evidence |
   | **Reasonable** | Widely accepted, consistent with context | Proceed — name it as an assumption |
   | **Unverified** | Plausible but not checked | Investigate before relying on it |
   | **Questionable** | Evidence is weak, conflicting, or context-dependent | Challenge actively — what if it's wrong? |

3. **For questionable assumptions:** Analyze the impact of the assumption being wrong.
   - How much of the analysis depends on this assumption?
   - What does the analysis look like if this assumption is false?
   - Can you gather evidence to verify or refute it?

4. **Track assumptions explicitly.** Don't let them become invisible load-bearing premises. When presenting findings that depend on assumptions, state so: "This conclusion holds if [assumption]. If [assumption] is wrong, then [different conclusion]."

---

## Evidence grounding techniques

Methods for connecting claims to observable reality rather than reasoning from intuition.

### Evidence hierarchy

Prefer sources higher in this list:

1. **Primary sources:** Direct observation — code you read, data you queried, documentation from the maintainer, behavior you tested
2. **Verified secondary sources:** Well-sourced analyses, engineering blogs with citations, official case studies
3. **Expert consensus:** Broadly accepted understanding among practitioners (lower weight than direct evidence, but useful when primary sources are unavailable)
4. **Analogical reasoning:** "X worked in similar context Y" (useful for hypothesis generation, not for conclusions)
5. **General reasoning:** Logical deduction from principles (lowest evidence weight — use only when nothing else is available, and label as SPECULATIVE)

### Evidence-first decision gate

Before labeling confidence on any claim, ask one question:

**"Can I prove this from direct observation alone?"**

| Answer | Action |
|---|---|
| **Yes** — you read the code, saw the data, verified the doc, observed the behavior | Full confidence range available. Label based on evidence strength. |
| **No** — claim depends on recalled knowledge, general reasoning, or unverified external information | Apply the confidence ceiling for the claim type (see SKILL.md confidence ceilings). Seek verification before asserting high confidence. |

This gate prevents the most common grounding failure: feeling confident about something you haven't actually verified.

### Grounding checks

For each claim in your analysis, verify:
- [ ] Can you point to specific evidence? (file, line, URL, data point, observed behavior)
- [ ] If not, can you gather it? (Read a file, search the web, run a query)
- [ ] If you can't gather it, have you labeled the claim's confidence accurately?
- [ ] Are you using the right language for the evidence level? (No "clearly" for INFERRED claims)
- [ ] Is each finding stated concretely enough to be verified or refuted? ("This approach reduces latency" is vague; "This approach reduces p99 latency by ~40% based on [evidence]" is verifiable.)

### When evidence conflicts

Distinguish between two types of conflicts:

**Your finding vs. primary evidence:** If you formed a finding and then discover primary evidence that contradicts it — **revise or drop the finding.** Do not present a false tension between your analysis and observable reality. The evidence wins. This is not a failure; it's the scientific method working correctly.

**External source vs. external source:** When two credible sources disagree:
1. Note both sources and their evidence
2. Assess recency — more recent evidence usually wins for factual claims
3. Assess proximity — evidence closer to the source of truth usually wins
4. Present the conflict to the user rather than silently resolving it
5. If you can investigate further to resolve the conflict, do so before presenting

---

## Introspective checkpoints

Run these checks at phase transitions and whenever you feel confident in a conclusion.

### Checkpoint questions

1. **Convergence check:** Am I settling on a conclusion too early? Have I genuinely explored alternatives, or am I pattern-matching from the first evidence I found?

2. **Confirmation bias check:** Am I seeking evidence that supports my current direction? What evidence have I encountered that contradicts it, and how did I handle that contradiction?

3. **Anchoring check:** Am I giving disproportionate weight to the first piece of evidence, the user's initial framing, or my prior knowledge? Would I reach the same conclusion if I encountered the evidence in a different order?

4. **Known unknowns check:** What do I know I don't know? How material is this gap to the analysis? Should I investigate before concluding?

5. **Perspective check:** Would someone with different domain experience, different risk tolerance, or different priorities reach a different conclusion from the same evidence? If so, have I accounted for their perspective?

6. **Scope check:** Am I analyzing what the user actually needs, or have I drifted into adjacent territory that's interesting but not useful for their purpose?

7. **Defensibility check:** Could you defend this analysis with evidence to someone who disagrees? If you couldn't point to specific evidence for your key claims, investigation is incomplete.

### When a checkpoint reveals a problem

| Problem detected | Correction |
|---|---|
| Converging too early | Go back and genuinely explore the strongest counter-argument. Don't just acknowledge it — investigate it. |
| Confirmation bias | Set aside your current conclusion temporarily. Spend a focused pass looking only for disconfirming evidence. |
| Anchored on first evidence | Re-examine key findings in reverse order. Does the conclusion hold when you start from different evidence? |
| Significant unknowns | Either investigate them (use Phase 1 tools) or present them explicitly as limitations of the analysis. |
| Missing perspective | Name the missing perspective and either explore it or flag it as a stated limitation. |
| Scope drift | Return to the user's stated purpose from Phase 0. Cut analysis that doesn't serve it. |
