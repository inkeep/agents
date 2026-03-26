Use when: REPORT.md is coming out repetitive (mirrors evidence files), the report needs to be more decision-useful (trade-offs, "when to use X"), or you need guidance on analytical tone, certainty calibration, and evidence presentation in synthesis
Priority: P1
Impact: Without this, REPORT.md often becomes a re-org of evidence rather than an analytical artifact that answers the primary question

---

# Report Synthesis Patterns (Analytical, Evidence-Linked)

Evidence files prove facts. REPORT.md should:
- answer the rubric's primary question directly
- make implications legible for the intended audience
- link every key claim to evidence

This reference provides report organization patterns that avoid "taxonomy-only restatements."

---

## 1) Choose the organization based on the reader's job-to-be-done

| Reader need | Recommended organization | Why |
|---|---|---|
| Decide / act (adoption, integration, architecture choice) | **Decision Questions + Trade-offs** | Mirrors how decisions are made |
| Understand internals ("how it works") | **Mechanism-first narrative** | Readers want flows and a mental model |
| Audit rubric coverage (team consumption) | **Rubric dimension order + analytical lens** | Easy traceability to rubric |

You can always include the rubric section, but don't let it force REPORT.md into a directory listing.

---

## 2) Pattern: Rubric-aligned + analytical lens (default-safe upgrade)

Use when you want to preserve rubric structure but avoid restating evidence.

For each dimension section, force value-add beyond evidence:
- **Finding**
- **Evidence link**
- **Implications (tie to primary question)**
- **Decision triggers (when this matters)**
- **Remaining uncertainty**

Template:

```md
### <Dimension>

**Finding:** <declarative>

**Evidence:** evidence/<dimension>.md

**Implications:**
- ...

**Decision triggers (when this matters):**
- If ...
- If ...

**Remaining uncertainty:**
- ...
```

---

## 3) Pattern: Decision Questions + Trade-offs (best for decision-making)

Convert the rubric into 5–10 "questions the reader will actually ask."

Template:

```md
## Executive Summary
- Primary answer (1–2 sentences)
- Most important caveat
- If conclusions stance: recommendation + why (evidence-linked)
- If factual stance: key findings only (no recommendation)

## Decision Questions (with evidence)
### 1) <Question>
**Answer:** <declarative answer>

**Evidence:** evidence/<file>.md

**Trade-offs:**
- Gains: ...
- Costs: ...
- Failure modes: ...

**What this implies:**
- ...

### 2) ...
...

## Constraints & Non-goals
- Out of scope (from rubric)
- Version/time bounds

## Open Questions / Next validation steps
- ...
```

Notes:
* If the report stance is factual/academic, the "Trade-offs" section is allowed, but avoid "therefore choose X" language.

---

## 4) Pattern: Mechanism-first narrative (good for deep dives)

Template:

```md
## Executive Summary
- What it is / does (1–2 sentences)
- Key mechanism (1 sentence)
- Critical caveat

## Mental Model
- 5–10 bullets defining key terms and "how to think about it"

## Core Flows
### Flow A: <name>
1. ...
2. ...
3. ...

Evidence: evidence/<file>.md

### Flow B: <name>
...

## Extension points / constraints
- What can be customized safely (evidence-linked)
- What is hard-coded or risky

## Operational considerations
- Deployment/ops constraints
- Observability hooks
- Failure modes

## Limitations & open questions
...
```

---

## 5) Analytical synthesis principles

These principles govern how findings are written in REPORT.md. They apply regardless of which organizational pattern you use.

### 5.1 Default to analytical, not prescriptive

Present evidence strength relative to competing claims. Let the reader assess trade-offs and draw conclusions. The agent's job is to make the evidence landscape legible — not to make the final judgment call.

**Only cross the prescriptive line when the user's report stance is "conclusions."** Even then, tie recommendations explicitly to evidence. Analytical framing ("the evidence strongly favors X because...") is more useful than bare directives ("use X").

### 5.2 Calibrate prose certainty to evidence confidence

The words you choose should reflect the strength of the underlying evidence. Do not write "clearly" or "definitively" for INFERRED findings, or "proves" for observations that merely suggest.

| Evidence confidence | Appropriate prose register |
|---|---|
| **CONFIRMED** (direct primary evidence) | "X uses Y" / "X does Y" — state as fact |
| **INFERRED** (logical from patterns) | "Evidence suggests..." / "Based on [sources], X likely..." |
| **UNCERTAIN** (partial, conflicting) | "It is unclear whether..." / "Sources disagree on..." |
| **NOT FOUND** (searched, absent) | "No evidence of X was found in [scope searched]" |

### 5.3 Express conditionality when the truth is conditional

Many findings are version-bounded, configuration-dependent, or context-specific. Write them that way. A finding that is true for v2.5+ but not v2.4 is not a universal truth — it is a conditional one.

Patterns:
- "As of version X.Y, [finding]."
- "[Finding] when configured with [setting]. Without it, [different behavior]."
- "[Finding] in [context A]. In [context B], [different outcome]."

Do not flatten conditional findings into unconditional claims for simplicity. The conditionality *is* the finding.

### 5.4 Surface evidence basis in proportion to materiality

Not every finding needs a detailed evidence audit. The agent's job is to make evidence legible for judgment, not to add caveats for completeness.

| Situation | What the reader needs | What the agent does |
|---|---|---|
| Finding is CONFIRMED, T1 source, uncontested | The claim itself | State the finding. Link to evidence. Move on. |
| Finding is INFERRED from mixed sources, or pivotal to the primary question | Enough context to calibrate confidence | Surface the evidence landscape — what sources say what, and where they agree/disagree |
| Finding is UNCERTAIN or contested | The honest state of knowledge | Present what is known, by whom, and with what methodology — without forcing a resolution |
| Finding has conditional applicability | When it applies vs when it does not | State the conditions explicitly (see 5.3) |

**Rule:** If omitting the evidence basis would not change how a reasonable reader interprets the finding, omit it. If it would, include it. Err toward brevity for uncontested claims and toward transparency for pivotal or contested ones.

### 5.5 Cite external sources inline using named references

When a specific statement, fact, or data point in REPORT.md is directly attributable to an external source, cite it inline using a **named reference** — just the proper noun.

**Format:** `[Proper Noun](URL)` — link text is the source's proper noun only. Sample sizes, caveats, and context go in surrounding prose, not in the link text.

> Reply rates have declined 40-60% since 2019 ([Smartlead](url) 5.1%, [Instantly](url) 3.43%, [Belkins](url) 5.8%).

> Connection notes lower acceptance by 2-12pp ([Belkins](url) 20M+; three smaller studies show mixed results).

> The SDK processes up to 10k events per second ([ExampleCo](https://docs.example.com/benchmarks)), though production deployments report lower throughput under mixed workloads ([ScaleCo](https://blog.company.com/scaling-lessons)).

**Why named refs over numbered refs:** The reader can assess source credibility at a glance — "[Gong](url)" carries different weight than "[random blog](url)." Numbered refs (`[[1]]`) require a lookup that breaks reading flow on stat-heavy reports.

**Cite inline when:**
- A specific fact, statistic, or data point from an identifiable source
- A direct claim attributed to a named party (maintainer statement, official announcement)
- A version-specific capability documented in official sources

**Do NOT cite inline when:**
- Cross-dimensional synthesis or analytical conclusions drawn from multiple evidence sources — this is the report's core value; don't interrupt it with per-source citations
- A claim draws on 3+ sources — that's synthesis, not attribution. Omit inline refs entirely and let the `**Evidence:**` link carry it
- General observations verifiable from multiple places
- Findings already linked via the `**Evidence:**` line (the evidence file provides full 1st-party citations)

**Limits:** 1–2 citations per statement, only when a single claim maps cleanly to 1–2 identifiable sources. Most sentences in the report should have zero. Inline citations are seasoning, not the main dish — the report's analytical voice and synthesis come first. If adding a citation would change how you write the sentence, don't add it.

---

## 6) Synthesis checklist (fast quality control)

Before finalizing REPORT.md:

* [ ] Executive Summary answers the primary question directly
* [ ] Top 3–7 decision-relevant insights are explicit
* [ ] Trade-offs are clear (gains vs costs) where relevant
* [ ] High-impact claims link to evidence
* [ ] Uncertainties are called out (with what to do next)
* [ ] Nothing is just restating evidence without implications/triggers
* [ ] Prose tone is analytical by default; prescriptive only if stance is "conclusions"
* [ ] Prose certainty matches evidence confidence (no "clearly" for INFERRED findings)
* [ ] Conditional findings state their conditions (version, config, context bounds)
* [ ] Evidence basis is surfaced in proportion to materiality — not for every claim
* [ ] Quantitative claims preserve exact population, metric type, and qualifiers from the source — no "40% of star performers" → "40% more deals" mutations
* [ ] Same stat cited in multiple places uses consistent values (exec summary, detail sections, tables)
* [ ] External Sources are hyperlinks; inline citations use named refs (`[Proper Noun](URL)`) selectively (1–2 source claims only; 3+ sources = synthesis, no inline refs)
