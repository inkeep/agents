Use when: Writing REPORT.md (Step 4) or evidence files (Step 3); need consistent structure
Priority: P1
Impact: Without this, report structure will be inconsistent and may miss required sections

---

# Section Templates

Reusable templates for REPORT.md and evidence/ files. Copy and adapt as needed.

---

## REPORT.md Templates

### Complete Report Template

```markdown
---
title: "[Report Title]"
description: "[1-3 sentence summary: what this report covers, what questions it answers, key domain terms for discoverability]"
createdAt: YYYY-MM-DD
updatedAt: YYYY-MM-DD
subjects:       # optional — proper nouns (companies, technologies, frameworks)
  - [Subject 1]
  - [Subject 2]
topics:         # optional — qualitative areas, <=3 words each
  - [topic area]
  - [topic area]
---

# [Report Title]

---

## Executive Summary

[2-4 paragraphs: Lead with the answer. Key findings. Critical caveats.]

**Key Findings:**
- **[Finding 1]:** One-line summary
- **[Finding 2]:** One-line summary
- **[Finding 3]:** One-line summary

---

## Tool/Feature Availability Matrix

| Tool/Feature | Context A | Context B | Context C |
|--------------|-----------|-----------|-----------|
| **Feature 1** | ✅ Yes | ❌ No | ⚠️ Partial |
| **Feature 2** | ✅ Yes | ✅ Yes | ✅ Yes |

**Key insight:** [What the matrix reveals]

---

## Detailed Findings

### 1. [Finding Category]

**Finding:** [Declarative statement of what was discovered]

**Evidence:** [evidence/<topic>.md](evidence/<topic>.md)

**Implications:**
- [What this means for the decision]
- [How this affects the use case]

### 2. [Next Finding Category]

**Finding:** [Statement]

**Evidence:** [evidence/<topic>.md](evidence/<topic>.md)

**Implications:**
- [Implication 1]

---

## Recommended Architecture/Approach

```
[ASCII diagram if applicable]
```

### Why This Works

1. **[Reason 1]** - [Evidence-backed explanation]
2. **[Reason 2]** - [Evidence-backed explanation]

---

## Limitations & Caveats

1. **[Limitation]** - [Description and impact]
2. **[Caveat]** - [What to watch out for]

---

## Open Questions

### What Could Not Be Confirmed
- [Item]: Searched [terms/locations], found [nothing/inconclusive]

### Areas for Further Investigation
- [Question]: [Where to look next]

---

## References

### Evidence Files
- [evidence/<file1>.md](evidence/<file1>.md) - [What it contains]
- [evidence/<file2>.md](evidence/<file2>.md) - [What it contains]

### External Sources
- [Title](URL) - [Brief description]
```

---

## Evidence File Templates

### Code Analysis Evidence

```markdown
# [Component/Feature] Analysis

**Source:** `path/to/file.ts` (lines X-Y)
**Date:** YYYY-MM-DD

---

## Code Capture

```typescript
// Include enough context to understand the code
export class ExampleService {
  async method(): Promise<Result> {
    // Key implementation details
  }
}
```

## Key Observations

- [Observation about architecture]
- [Observation about behavior]
- [Observation about limitations]

## Inferences

- [Logical conclusion 1]
- [Logical conclusion 2]
```

### Test/Experiment Evidence

```markdown
# [Test Name] Results

**Date:** YYYY-MM-DD
**Method:** [What was tested and how]
**Context:** [Environment, version, conditions]

---

## Test Input

[Exact input provided - prompt, request, etc.]

## Response

[Full response captured verbatim]

## Analysis

- **Confirms:** [What this proves]
- **Disproves:** [What this rules out]
- **Unclear:** [What remains uncertain]
```

### Documentation/Web Evidence

```markdown
# [Source Title]

**URL:** [Full URL]
**Accessed:** YYYY-MM-DD
**Type:** [Official docs / Blog post / API reference / etc.]

---

## Relevant Excerpts

> "Direct quote from the source that supports the finding"

> "Another relevant quote"

## Key Points

- [Extracted insight 1]
- [Extracted insight 2]

## Context

[Any additional context about the source's authority or limitations]
```

### Comparison Evidence

```markdown
# [System A] vs [System B]: [Aspect]

**Date:** YYYY-MM-DD
**Sources:**
- System A: [repo/docs]
- System B: [repo/docs]

---

## System A

**Source:** `path/to/code`

```code
[Relevant implementation]
```

**Characteristics:**
- [Trait 1]
- [Trait 2]

## System B

**Source:** `path/to/code`

```code
[Relevant implementation]
```

**Characteristics:**
- [Trait 1]
- [Trait 2]

## Comparison

| Dimension | System A | System B |
|-----------|----------|----------|
| [Aspect 1] | [Finding] | [Finding] |
| [Aspect 2] | [Finding] | [Finding] |
```

### Configuration/Schema Evidence

```markdown
# [System] Configuration Analysis

**Source:** `path/to/config` or [URL]
**Date:** YYYY-MM-DD

---

## Schema/Configuration

```yaml
# Full configuration with comments
setting:
  option1: value  # Description
  option2: value  # Description
```

## Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `VAR_1` | Yes | - | [Description] |
| `VAR_2` | No | `value` | [Description] |

## Key Observations

- [What's configurable]
- [What's hardcoded]
- [Notable defaults]
```

---

## REPORT.md Section Patterns

### Executive Summary (Decision-Focused)

```markdown
## Executive Summary

**Primary Finding:** [One sentence answer to the main question]

[Technology] [does/does not] meet the requirements for [use case]. The implementation uses [approach] with [key characteristic].

| Dimension | Status | Confidence |
|-----------|--------|------------|
| [Requirement 1] | ✅ Met | CONFIRMED |
| [Requirement 2] | ⚠️ Partial | INFERRED |
| [Requirement 3] | ❌ Not Met | CONFIRMED |

**Critical Caveat:** [Most important limitation or risk to consider]
```

### Executive Summary (Comparison - With Conclusions)

```markdown
## Executive Summary

This analysis compares [System A] and [System B] for [use case].

**Recommendation:** [System] is better suited because [evidence-based reason].

| Criterion | System A | System B | Winner |
|-----------|----------|----------|--------|
| [Criterion 1] | [Assessment] | [Assessment] | [A/B/Tie] |
| [Criterion 2] | [Assessment] | [Assessment] | [A/B/Tie] |

**Trade-off:** Choosing [recommended] gains [benefit] but loses [capability].
```

### Executive Summary (Comparison - Factual/Academic)

Use this when the report should NOT include conclusions—e.g., when another agent will draw conclusions or the user wants to decide themselves.

```markdown
## Executive Summary

This report compares [System A] and [System B] for [use case]. Findings are presented factually; conclusions are left to the reader.

### Key Findings

- **[System A]:** [Factual capability summary]
- **[System B]:** [Factual capability summary]

### Capability Comparison

| Criterion | System A | System B |
|-----------|----------|----------|
| [Criterion 1] | [Finding] | [Finding] |
| [Criterion 2] | [Finding] | [Finding] |

*Note: Findings presented without judgment. See detailed sections for evidence.*
```

### Executive Summary (Factual/Academic - General)

Use this template for any report type when conclusions should be omitted.

```markdown
## Key Findings

This report investigates [topic] for [use case]. Findings are presented factually for the reader to draw conclusions.

### [Subject A] Capabilities
- [Factual finding 1]
- [Factual finding 2]

### [Subject B] Capabilities
- [Factual finding 1]
- [Factual finding 2]

### Verification Status

| Item | Status | Notes |
|------|--------|-------|
| [Item 1] | CONFIRMED / PARTIAL / PENDING | [Context] |
```

### Finding Section (with Evidence Link)

```markdown
### [Finding Title]

**Finding:** [Declarative statement - what is true]

**Evidence:** [evidence/<file>.md](evidence/<file>.md)

**How it works:**
1. [Step 1 of mechanism]
2. [Step 2 of mechanism]
3. [Result]

**Implications:**
- [What this means for decision/use case]
- [What to do with this information]
```

**Inline citation example** — when a specific fact maps to 1–2 identifiable sources, use named references (`[Proper Noun](URL)`):

```markdown
### Connection Scaling

**Finding:** The gateway supports horizontal scaling but requires sticky sessions for WebSocket connections.

**Evidence:** [evidence/scaling.md](evidence/scaling.md)

The official documentation confirms a hard limit of 10k concurrent connections per node ([ExampleGateway](https://docs.example.com/limits)). Independent benchmarks suggest practical throughput drops around 8k under mixed workloads ([ScaleCo](https://blog.company.com/gateway-bench)).

**Implications:**
- Production deployments exceeding 8k connections should plan for multi-node setup
```

> Most finding sections will have zero inline citations. Use them only when a specific fact maps cleanly to 1–2 identifiable sources. Cross-dimensional analysis and synthesis claims should NOT be interrupted with inline citations.

### Architecture Recommendation

```markdown
## Recommended Architecture

Based on these findings, the optimal approach is:

```
┌─────────────────────────────────────┐
│           [Component A]              │
│                                      │
│  ┌──────────┐    ┌──────────┐       │
│  │ [Part 1] │───▶│ [Part 2] │       │
│  └──────────┘    └──────────┘       │
└─────────────────────────────────────┘
```

### Why This Works

1. **[Reason 1]** - [Evidence: evidence/file.md]
2. **[Reason 2]** - [Evidence: evidence/file.md]

### Trade-offs

- **Gains:** [What this approach provides]
- **Costs:** [What this approach requires/loses]
```

### Limitations Section

```markdown
## Limitations & Caveats

### Confirmed Limitations

| Limitation | Impact | Workaround |
|------------|--------|------------|
| [Limitation 1] | [Business impact] | [Alternative approach] |
| [Limitation 2] | [Business impact] | [Alternative approach] |

### Scope Boundaries

This report does NOT cover:
- [Out of scope item 1]
- [Out of scope item 2]

### Time-Bound Caveats

- **Version analyzed:** [version] - findings may not apply to newer versions
- **Analysis date:** [date] - roadmap items may have changed
```

### Open Questions Section

```markdown
## Open Questions

### Could Not Confirm

| Question | What Was Searched | Finding |
|----------|-------------------|---------|
| [Question 1] | [terms, locations] | No evidence found |
| [Question 2] | [terms, locations] | Inconclusive |

### Requires Runtime Validation

- [Item]: Static analysis insufficient; needs [type of testing]

### Future Investigation

1. **[Question]**
   - Why it matters: [Context]
   - Where to look: [Suggested sources]
```

### References Section

```markdown
## References

### Evidence Files (Primary)
| File | Contains |
|------|----------|
| [evidence/topic-1.md](evidence/topic-1.md) | [Description] |
| [evidence/topic-2.md](evidence/topic-2.md) | [Description] |

### Code Repositories
- [org/repo](URL) - commit `abc123` (YYYY-MM-DD)

### Documentation
- [Official Docs](URL) - [Specific page/section]

### External Sources
- [Article Title](URL) — [Author/Publication, Date]
- [Official Documentation](URL) — [Brief description]
```

> **Note:** Inline citations in the report body use named references (`[Proper Noun](URL)`) — not numbered refs. The External Sources list provides the full URL registry. Not every source needs an inline citation — only those directly attributed to a specific claim.

---

## Report Type Templates

### Capability Assessment Report

```markdown
---
title: "[Technology] Capability Assessment"
description: "Determine if [technology] meets requirements for [use case]. Covers [key dimensions]."
createdAt: YYYY-MM-DD
updatedAt: YYYY-MM-DD
subjects:
  - [Technology]
topics:
  - capability assessment
---

# [Technology] Capability Assessment

---

## Executive Summary

[Technology] [meets/partially meets/does not meet] requirements.

## Requirements Matrix

| Requirement | Status | Evidence |
|-------------|--------|----------|
| [Req 1] | ✅ | [evidence/...] |
| [Req 2] | ⚠️ | [evidence/...] |

## Detailed Analysis

### [Requirement 1]: [Title]
[Finding + evidence link + implications]

## Gaps & Workarounds

| Gap | Workaround | Effort |
|-----|------------|--------|

## Recommendation

[Go/No-Go with rationale]
```

### Comparative Analysis Report

```markdown
---
title: "[System A] vs [System B] Comparison"
description: "Select between [A] and [B] for [use case]. Compares [key dimensions]."
createdAt: YYYY-MM-DD
updatedAt: YYYY-MM-DD
subjects:
  - [System A]
  - [System B]
topics:
  - system comparison
---

# [System A] vs [System B] Comparison

---

## Executive Summary

**Recommendation:** [System] for [use case]

## Comparison Matrix

| Dimension | System A | System B | Evidence |
|-----------|----------|----------|----------|

## System A Analysis
[Findings with evidence links]

## System B Analysis
[Findings with evidence links]

## Decision Framework

Choose System A when: [criteria]
Choose System B when: [criteria]
```

### Integration Research Report

```markdown
---
title: "Integrating [System] with [Our Stack]"
description: "Document integration path and requirements for [System]. Covers auth, data flow, API surface, and implementation path."
createdAt: YYYY-MM-DD
updatedAt: YYYY-MM-DD
subjects:
  - [System]
topics:
  - integration research
---

# Integrating [System] with [Our Stack]

---

## Executive Summary

Integration is [feasible/complex/not recommended] because [reason].

## Integration Points

### Authentication
[How auth works, evidence link]

### Data Flow
[How data moves, evidence link]

### API Surface
[Key endpoints, evidence link]

## Implementation Path

1. [Step 1] - [Effort estimate]
2. [Step 2] - [Effort estimate]

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|------------|------------|
```
