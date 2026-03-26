Use when: After completing a report (any path), when reviewing an existing report for quality, or when the agent or user suspects logical inconsistencies across findings
Priority: P1
Impact: Without this, reports may contain cross-finding contradictions, overconfident claims, or synthesis that doesn't faithfully represent evidence — reducing reliability for decision-making

---

# Coherence Audit Protocol

Re-read a completed report to identify logical incoherences, contradictions, and claims that don't hold up under scrutiny — then categorize findings and propose resolutions.

This protocol has two phases:
- **Phase 1: Diagnosis** — Read-only. Identify issues without fixing or researching anything.
- **Phase 2: Resolution** — Fix issues in batches, escalating from existing evidence to new research only as needed.

The protocol complements the analytical synthesis principles in `report-synthesis-patterns.md` (section 5). The principles govern how to write findings. This audit checks whether the finished report achieves that standard.

---

## When to run a coherence audit

| Trigger | Who initiates | Notes |
|---|---|---|
| User requests a review | User | "Re-read the report and find contradictions" |
| Agent surfaces it as a follow-up option (Step 6.2) | Agent | Especially when research surfaced conflicting evidence, many UNCERTAIN findings, or complex cross-dimension interactions |
| High-stakes research | Either | Architecture decisions, security assessments, comparative analyses where the wrong conclusion is costly |
| Reviewing an older report before acting on it | Either | Reports age; a coherence check doubles as a staleness spot-check |

**When NOT to run one:**
- Simple 1-2 dimension reports with straightforward findings
- Direct answers (Path B) — unless the user specifically asks
- When the user has signaled they're done and don't want further iteration

**Timing matters.** The audit is most valuable after the research surface is substantively complete — not mid-stream. Contradictions found after multiple research passes across many dimensions are genuine tensions between independently-researched findings. Contradictions found mid-draft are often artifacts that natural revision would clean up. If the report is still being actively expanded, finish the research first.

---

## Phase 1: Diagnosis (read-only)

The goal is to produce a complete list of coherence issues without fixing anything. No new research, no edits — just identification and categorization.

### Audit lenses

Apply these lenses systematically. Each maps to one or more analytical synthesis principles.

**Lens 1 (contradictions) tends to produce the highest-value findings.** Contradictions force a resolution that requires understanding *why* two claims conflict — which deepens the analysis. The other lenses catch real issues, but they typically resolve with wording changes rather than analytical improvements.

#### Lens 1: Cross-finding contradictions

Do findings across dimensions logically conflict?

**Scan for:**
- Direct contradictions: "X supports Y" in one section, "X does not support Y" in another
- Implication conflicts: Finding A implies Z, but Finding B implies not-Z
- Inconsistent characterizations: Same capability described positively in one dimension, negatively in another, without explaining why the assessment differs

**Common cause:** Findings written dimension-by-dimension without cross-checking. Each is locally correct but globally inconsistent.

**Typical resolution:** Add conditionality (principle 5.3) — often both claims are true under different conditions.

#### Lens 2: Confidence-prose misalignment

Does the prose certainty match the evidence confidence?

**Scan for:**
- INFERRED findings stated as facts ("X does Y" when evidence only suggests it)
- CONFIRMED findings unnecessarily hedged ("X may do Y" when evidence is direct)
- NOT FOUND treated as negative evidence ("X can't do Y" vs "no evidence of Y was found")
- Vague qualifiers that don't track to evidence ("seemingly," "arguably," "generally")

**Common cause:** Defaulting to confident-sounding prose regardless of evidence, or hedging everything uniformly.

**Typical resolution:** Recalibrate prose to evidence (principle 5.2).

#### Lens 3: Missing conditionality

Are unconditional claims actually conditional?

**Scan for:**
- Version-bounded findings stated as universal truths
- Configuration-dependent behavior described as default behavior
- Context-specific findings (scale, use case, deployment model) missing their context
- Claims true for the researched version but not necessarily true generally

**Common cause:** Flattening conditional truths for readability. The conditionality gets lost in synthesis.

**Typical resolution:** Express conditions explicitly (principle 5.3).

#### Lens 4: Evidence-synthesis fidelity

Does the synthesis faithfully represent the evidence?

**Scan for:**
- Claims that go beyond what evidence files actually show
- Selective use of evidence (conclusion draws on one data point but evidence file has mixed signals)
- Stale references (evidence updated or corrected but synthesis section wasn't)
- Unsupported qualifiers ("the most," "always," "never") added during synthesis

**How to check:** For pivotal or contested findings, open the linked evidence file and compare. Apply the materiality principle (5.4) — focus on findings that are high-impact, INFERRED, or pivotal to the primary question. Don't audit every evidence link.

**Typical resolution:** Sharpen the claim to match evidence, or surface the evidence landscape more explicitly (principle 5.4).

#### Lens 5: Executive summary coherence

Does the summary accurately reflect the detailed findings?

**Scan for:**
- Key findings in the summary not supported by corresponding detail sections
- Detail sections with findings important enough for the summary but absent from it
- Summary confidence/tone that doesn't match the detailed findings
- Summary written early and not revised after detailed findings evolved

**Common cause:** Summary drafted first (or templated) then not fully revised after findings were complete.

**Typical resolution:** Sharpen — rewrite the summary to reflect the actual findings.

#### Lens 6: Stance consistency

Is the report's chosen stance applied uniformly?

**Scan for:**
- Factual/academic report with accidental recommendations ("you should," "we recommend")
- Analytical sections that slip into prescriptive conclusions
- Inconsistent depth of evidence transparency across sections
- Tone shifts between sections (detached analysis in one, advocacy in another)

**Common cause:** Agent loses track of stance mid-report, especially in later sections or when findings are strong.

**Typical resolution:** Align to the analytical default (principle 5.1) or the explicitly chosen stance.

#### Lens 7: Inline source attribution

Can a reader assess the credibility of quantitative claims without opening evidence files?

**This lens is highest-value for reports with many stats** — benchmarks, comparisons, outbound playbooks, cost analyses. For architecture or codebase reports with few external stats, this lens is a quick pass.

**Scan for:**
- Stats from a single identifiable source presented without any source name ("reply rates average 5.1%")
- Vague attribution that prevents verification ("Multiple", "studies show", "data suggests", "research indicates") when 1–2 specific sources exist
- Same stat appearing with different or inconsistent attribution across sections
- Stats missing critical context: sample size, population, or methodology qualifier
- Study-specific findings stated as universal truths (e.g., PR/journalist data applied to B2B sales without noting the population difference)
- Vendor-sourced data without product-incentive-bias caveat (e.g., citing a platform's stats for a feature that platform sells)
- Composite or derived metrics presented as single-source measurements (e.g., stacking per-channel lifts into "4.7x" without noting the derivation)
- Practitioner-reported anecdotes presented as verified data (e.g., "90% response rate" from a single person's LinkedIn post)

**Do NOT flag:**
- Synthesized findings drawn from 3+ sources — these should NOT have inline citations. The analytical voice and synthesis are the report's core value. The `**Evidence:**` link provides full attribution.
- Claims where adding a citation would interrupt the analytical flow or change how the sentence reads
- General directional statements supported by broad consensus across evidence (e.g., "reply rates have declined industry-wide")

**Common cause:** Evidence files contain full attribution, but source details are dropped during synthesis for readability. Also, stats copied between sections (especially into exec summaries) lose or change their attribution.

**Typical resolution:** Add a named-ref inline citation (`[Proper Noun](URL)`) with context in surrounding prose. Link text is just the proper noun — sample sizes, caveats, and qualifiers go outside the link. See `citation-formats.md` "Inline Report Citations (Named References)" for the full convention.

**Minimum inline attribution per stat type:**

| Stat type | Minimum inline attribution | Example |
|---|---|---|
| Named-study metric | `[Source](url)` + sample size in prose | `([Belkins](url) 16.5M)` |
| Practitioner anecdote | `[Name](url)` + unverified caveat | `([Becc Holland](url) — practitioner-reported, unverified)` |
| Vendor-sourced data | `[Vendor](url)` + bias note | `([Lemlist](url) — vendor-conducted; product incentive bias)` |
| Composite/derived metric | parenthetical explaining derivation (no inline refs — composites are 3+ sources) | `(composite — no single study; derived from multiple per-channel sources)` |
| Cross-population transfer | `[Source](url)` + population caveat | `([Backlinko](url) 12M — PR/journalist outreach, not B2B sales)` |
| Unverifiable claim | source + directional caveat | `([Letterdrop](url) — no traceable primary study; treat as directional)` |

### Diagnosis workflow

#### Step 1: Read the full report as a reader

Read REPORT.md end-to-end without stopping to cross-reference evidence. Read it the way the intended audience would. Note anything that feels off, surprising, contradictory, or overconfident. Don't rationalize — if something reads strangely, mark it.

This intuitive pass catches issues that systematic lens-by-lens analysis might miss.

#### Step 2: Apply audit lenses systematically

Go through each of the 7 lenses. For each, scan the report with that specific focus. Record findings using the output format below.

**Efficiency guidance:**
- Lenses 1 and 5 (contradictions, summary coherence) require reading across sections — do these with the full report in view.
- Lenses 2 and 3 (confidence, conditionality) can be checked section-by-section.
- Lens 4 (evidence fidelity) requires opening evidence files — apply the materiality principle. Only spot-check evidence for pivotal, contested, or lens-flagged findings.
- Lens 6 (stance) is a quick pass if the stance is clear.
- Lens 7 (source attribution) is section-by-section. For stat-heavy reports (benchmarks, playbooks, cost analyses), this lens often produces the most findings. For architecture reports with few external stats, it's a quick pass.

#### Step 3: Cross-reference evidence (targeted)

For any finding flagged by the lenses — especially Lens 4 — open the linked evidence file and verify:
- Does the evidence support the claim as written?
- Is the confidence label accurate?
- Is there evidence in the file that the synthesis didn't incorporate but should have?

Do not audit every evidence file for every finding. Focus on:
- Findings rated high severity
- Findings where prose and confidence label feel mismatched
- Findings pivotal to the primary question

#### Step 4: Produce findings list

Use the output format below. Assign severity, categorize by lens, and propose a resolution for each.

#### Step 5: Present to user

Show the complete findings list. Let the user decide which to pursue. Do not auto-fix — the user may have context that changes the assessment, or may disagree with a finding.

Frame it as: "Here are candidates for refinement, ordered by severity. Which would you like me to address?"

This is the handoff from Phase 1 to Phase 2. The user controls what happens next — which findings to fix, in what order, and how many at a time.

---

## Phase 2: Resolution (scoped to findings)

Fix approved findings in batches. Research is now authorized, but scoped to resolving specific audit findings — not open-ended exploration of dimensions.

### Batch execution

When there are more than ~5 findings to resolve, work in batches of 4-5:
- The user selects or approves a batch.
- Resolve that batch completely (triage, fix, changelog, summary).
- Report back with what was done.
- The user says "next batch" or adjusts the approach.

This keeps each round reviewable and lets the user course-correct between batches. If the approach is working, the user can continue with minimal steering ("same approach, next batch"). If something isn't working, the batch boundary is a natural adjustment point.

### Resolution approach (per finding)

For each finding, follow a graduated approach — exhaust what you have before seeking what you don't.

#### Level 1: Re-examine existing evidence

Before any new research, go back to the source material:

- Re-read the cited evidence files for both sides of the incoherence
- Check source timeliness and trustworthiness (apply T1-T4 tiers, recency thresholds from `web-search-guidance.md`)
- Determine whether the synthesis misrepresented the evidence, or whether the evidence itself is the issue

Many incoherences resolve here. The evidence already supports a coherent story that synthesis didn't capture — a Sharpen, Add conditions, or Recalibrate fix using what's already in the evidence files.

#### Level 2: Narrow verification

If existing evidence is insufficient and you have a specific factual question:
- "Is X deployed in production — yes or no?"
- "What's the sample size of that study?"
- "Does the API actually require authentication for this endpoint?"

Quick, pointed research. The question comes directly from the audit finding.

#### Level 3: Deeper exploration

If the incoherence stems from an angle or perspective the original research didn't cover:
- The existing evidence surface has a genuine gap
- Neither side of the contradiction has strong enough evidence to resolve it
- Understanding the incoherence requires exploring adjacent context not previously researched

This is substantive new research, but still scoped to the specific area of incoherence — not a full dimension re-investigation. The research question originates from the audit finding, not from general curiosity.

**Scope discipline:** Whether level 2 or level 3, all research stays anchored to resolving the specific finding. If the research reveals a much larger gap than expected, flag it as a potential additive research run rather than expanding the audit's scope.

### Triage within each batch

At the start of each batch:

1. **Classify each finding:** Does it need new research (level 2 or 3), or is it resolvable from existing evidence (level 1)?
2. **Run editorial fixes first.** Level 1 resolutions (Sharpen, Add conditions, Recalibrate, Acknowledge ambiguity from existing evidence) can proceed immediately.
3. **Dispatch research in parallel.** For findings needing level 2 or 3, spin up targeted research while editorial fixes are applied.
4. **Synthesize.** When research returns, apply the resolution. Verify it doesn't introduce new incoherences with adjacent findings.
5. **Log.** Append to `meta/_changelog.md` with what changed and why.
6. **Report back.** Summarize each fix in the batch: finding number, resolution applied, what was edited.

### Resolution taxonomy

| Resolution | When to use | Typical level | Connects to |
|---|---|---|---|
| **Sharpen** | Evidence supports a clearer claim than what's written | Level 1 | Principle 5.4 |
| **Add conditions** | Truth is conditional; finding flattened it | Level 1-2 | Principle 5.3 |
| **Recalibrate** | Prose certainty doesn't match evidence strength | Level 1 | Principle 5.2 |
| **Acknowledge ambiguity** | Evidence is genuinely unclear; report forces a resolution evidence doesn't support | Level 1-2 | Principles 5.2 + 5.4 |
| **Re-research** | Existing evidence insufficient to resolve | Level 2-3 | Back to research workflow |

**Heuristic:** Most coherence issues resolve at level 1 with Sharpen, Add conditions, or Recalibrate. If many findings require level 3, that signals the original research pass had significant gaps — not just a synthesis problem.

### Applying edits

For all edits, treat as a Path C corrective update:
- Surgical changes to REPORT.md — only the sections identified in the finding.
- Update evidence files only if the evidence itself was the issue (not just synthesis wording).
- If the report has `meta/_changelog.md`, append an entry noting the coherence audit and what was changed per batch.
- After each batch, briefly verify the fixes didn't introduce new incoherences with adjacent findings.

---

## Severity calibration

| Severity | Definition | Threshold |
|---|---|---|
| **High** | Could change the reader's decision or materially alter their understanding of a key finding | Primary question's answer or a P0 dimension's conclusion is affected |
| **Medium** | Misleading or imprecise, but doesn't change the core answer | A supporting finding or P1 dimension is affected; reader might be confused but wouldn't decide differently |
| **Low** | Minor inconsistency or imprecision a careful reader would notice | Wording choices, minor hedging inconsistencies, formatting |

**Triage rule:** If the audit produces many findings, prioritize High. Medium is "should fix if time allows." Low is "note for next revision."

---

## Output format

Present Phase 1 findings in this structure:

```md
## Coherence Audit Findings

**Report:** <reports-dir>/<name>/REPORT.md
**Audit date:** YYYY-MM-DD
**Scope:** Full audit | Targeted (lenses X, Y only)
**Total findings:** N (H high, M medium, L low)

---

### [H/M/L] Finding 1: <Short description>

**Lens:** <which audit lens>
**Location:** <section(s) in REPORT.md>
**Issue:** <what's incoherent — be specific>
**Current text:** "<quote the problematic passage>"
**Evidence says:** <what the evidence actually shows, if relevant>
**Resolution:** Sharpen | Add conditions | Recalibrate | Acknowledge ambiguity | Re-research
**Suggested fix:** <specific proposed change or research question>

---

### [H/M/L] Finding 2: ...
```

Order findings by severity (High first), then by report section order within each severity level.

---

## Integration with the main workflow

This audit connects to the research workflow at three points:

1. **Step 6.2 (follow-up options):** After delivering a report, the agent may surface a coherence audit as a follow-up direction — especially when research involved conflicting sources, many UNCERTAIN findings, or complex cross-dimension interactions.

2. **On-demand:** The user can request an audit on any existing report at any time. Load this reference and run the workflow.

3. **Post-update (Path C):** After a corrective or additive update, a targeted audit (focusing on lenses 1, 4, 5, and 7 for stat-heavy reports) can verify the update didn't introduce new incoherences.

**Relationship to analytical synthesis principles:** The audit lenses check whether principles 5.1-5.5 from `report-synthesis-patterns.md` were followed. The resolution taxonomy maps findings back to those principles. When the audit identifies an issue, the fix almost always involves better application of one of the four principles.
