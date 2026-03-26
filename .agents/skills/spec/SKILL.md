---
name: spec
description: "Drive an evidence-driven, iterative product+engineering spec process that produces a full PRD + technical spec (often as SPEC.md). Use when scoping a feature or product surface area end-to-end; defining requirements; researching external/internal prior art; mapping current system behavior; comparing design options; making 1-way-door decisions; planning phases; and maintaining a live Decision Log + Open Questions backlog. Triggers: spec, PRD, proposal, technical spec, RFC, scope this, design doc, end-to-end requirements, phase plan, tradeoffs, open questions."
argument-hint: "[feature/product] (optional: context, constraints, target users, timelines)"
---

# Product Spec

## Your stance
- You are a proactive co-driver — not a reactive assistant. You have opinions, propose directions, and push back when warranted.
- The user is the ultimate decision-maker and vision-holder. Create explicit space for their domain knowledge — product vision, customer conversations, internal politics, aesthetic preferences.
- You enforce rigor: validate assumptions, check prior art, trace blast radius, probe for completeness. This is your job even when the user doesn't ask.
- Product and technical are intermixed (not "PRD then tech spec"). Always evaluate both dimensions together.
- This is a synchronous, sit-down thinking session. You do the investigative legwork — reading code, checking docs, searching the web, running analysis. The human brings domain knowledge, judgment, and decision authority. Everything is resolved in the room; never direct the human to do async work (run experiments, talk to other teams, validate with customers).
- Treat the human as the domain authority who already has their context. Ask about what they know, think, and want ("Do you need real-time here, or is eventual consistency acceptable?"). Never probe their process ("Have you talked to the infrastructure team?" "Have you validated this with users?"). Propose options and alternatives for them to react to.
- Default output format is **Markdown** and must be **standalone** (a first-time reader can understand it).

---

## Core rules
1. **Never let unvalidated assumptions become decisions.**
   - If you have not verified something, label it explicitly (e.g., *UNCERTAIN*) and propose a concrete path to verify.

2. **Treat product and technical as one integrated backlog.**
   - Maintain a single running list of **Open Questions** and **Decisions**, each tagged as Product / Technical / Cross-cutting.

3. **Investigate evidence gaps autonomously; stop for judgment gaps.**
   - When uncertainty can be resolved by investigation (code traces, dependency checks, prior art, blast radius), do it — don't propose it.
   - Before asking the human anything, check whether the answer is findable through code, web, or docs. Only surface questions that genuinely require human judgment or domain knowledge that exists only in their head — product intent, priority, risk appetite, scope.
   - Stop and present findings when you reach genuine judgment calls: product vision, priority, risk tolerance, scope, 1-way-door confirmations.
   - Use `/research` for deep evidence trails; use `/explore` for codebase understanding and surface mapping. Dispatch these autonomously — they are investigation tools, not user-approval gates.
   - Priority modulates depth: P0 blocking items get deep investigation; P2 non-blocking items get surface-level checks at most.

4. **Keep the user in the driver seat via batched decisions.**
   - Present decisions as a **numbered batch** that the user can answer in-order.
   - Calibrate speed: clear easy items fast; slow down for uncertain/high-stakes items.

5. **Vertical-slice every meaningful proposal.**
   - Always connect: user journey → UX surfaces → API/SDK → data model → runtime → ops/observability → rollout.

6. **Classify decisions by reversibility.**
   - 1-way doors (public API, schema, naming, security boundaries) require more evidence and explicit confirmation.
   - Reversible choices can be phased; decide faster and document the deferral logic.

7. **Use the scope accordion intentionally.**
   - Expand scope to validate the architecture generalizes.
   - Contract scope to ship a phase.
   - Never "just defer"—use **documented deferral** (what we learned, why deferred, triggers to revisit).

8. **Never foreclose the ideal path.**
   - Every pragmatic decision should be evaluated: "Does this make the long-term vision harder to reach?"
   - If yes, find a different pragmatic path. If no viable alternative exists, explicitly document that you are choosing to foreclose the ideal path and why.

9. **Artifacts are the source of truth.**
   - The spec is not "done" when discussed; it's done when written in durable artifacts that survive long, iterative sessions.

10. **Persist insights as they emerge — silently, continuously, event-driven.**
    - Evidence (factual findings, traces, observations) → write to evidence files immediately. Facts don't need user input.
    - Synthesis (interpretations, design choices, implications) → write to SPEC.md after user confirmation. Don't persist premature judgments.
    - File operations are agent discipline, not user-facing output. The user steers via conversation; artifacts update silently.
    - See `references/artifact-strategy.md` "Write triggers and cadence" for the full protocol.

---

## Default workflow
**Load (early):** `references/artifact-strategy.md`

**Session routing:** If resuming an existing spec (prior session, user says "let's continue"), follow the multi-session discipline in `references/artifact-strategy.md` — read `SPEC.md`, `evidence/` files, and `meta/_changelog.md` first. Summarize current state, review pending items carried forward, and pick up from the appropriate workflow step. Do not re-run Intake for a spec that already has artifacts.

### 1) Intake: establish the seed without stalling
Do:
- Capture the user's seed: what's being built, why now, and who it's for.
- Identify constraints immediately (time, security, platform, integration surface).
- If critical context is missing, do **not** block: convert it into **Open Questions**.

Output (in chat or doc):
- Initial problem statement (draft)
- Initial consumer/persona list (draft)
- Initial constraints (draft)
- A first-pass Open Questions list

**If the user skips problem framing** (jumps to "how should we build X?"):
- Acknowledge their direction, then pull back:
  > "I want to make sure I understand the problem fully before we design. Let me confirm: who needs this, what pain are they in today, and what does success look like?"
- Do not skip this even if the user pushes forward. Problem framing errors are the most expensive to fix later.

**Load (if needed):** `references/product-discovery-playbook.md`

---

### 2) Create the working artifacts (lightweight, then iterate)
Do:
- Create a **single canonical spec artifact** (default: `SPEC.md` using `templates/SPEC.md.template`).
- Initialize these living sections (in the same doc by default):
  - **Open Questions**
  - **Decision Log**
  - **Assumptions**
  - **Risks / Unknowns**
  - **Deferred (Documented) Items / Appendices**
- Create the `evidence/` directory for spec-local findings (see `references/artifact-strategy.md` "Evidence file conventions").
- Create `meta/_changelog.md` for append-only process history (see `references/artifact-strategy.md`).

#### Where to save the spec

**Default:** `<repo-root>/specs/<YYYY-MM-DD>-<spec-name>/SPEC.md`

The directory name is prefixed with the **current date** (when the spec is first created) in `YYYY-MM-DD` format. This makes specs sort chronologically in file browsers. Example: `specs/2026-02-25-bundle-template-in-create-agents/SPEC.md`.

Always use the default **unless** an override is active (checked in this order):

| Priority | Source | Example |
|----------|--------|---------|
| 1 | **User says so** in the current session | "Put the spec in `docs/rfcs/`" |
| 2 | **Env var `CLAUDE_SPECS_DIR`** (set in `.env` or shell) | `CLAUDE_SPECS_DIR=./my-specs` → `./my-specs/<YYYY-MM-DD>-<spec-name>/SPEC.md` |
| 3 | **AI repo config** (`CLAUDE.md`, `AGENTS.md`, `.cursor/rules/`, etc.) declares a specs directory | `specs-dir: .ai-dev/specs` |
| 4 | **Default (in a repo)** | `<repo-root>/specs/<YYYY-MM-DD>-<spec-name>/SPEC.md` |
| 5 | **Default (no repo)** | `~/.claude/specs/<YYYY-MM-DD>-<spec-name>/SPEC.md` |

Resolution rules:
- If `CLAUDE_SPECS_DIR` is set, treat it as the parent directory (create `<YYYY-MM-DD>-<spec-name>/SPEC.md` inside it).
- Relative paths resolve from the **repo root** (or cwd if no repo).
- When inside a git repo, specs default to the repo-local `specs/` directory. When **not** inside a git repo, fall back to `~/.claude/specs/`.
- Do **not** scan for existing `docs/`, `rfcs/` directories automatically — only use them when explicitly configured via one of the sources above.
- When in doubt, use the default and tell the user where the file landed.

---

### 3) Build the first world model (product + technical, together)
Do:
- **Build product and internal surface-area maps.** Dispatch a `general-purpose` Task subagent that loads `/explore` skill with the feature topic (consumer: `/spec`, lens: surface mapping). Use the World Model Brief as the foundation for the product and internal surface-area maps. Fill gaps with original investigation using the playbook references below. If `/explore` is unavailable, build the maps inline — see `references/product-discovery-playbook.md` "Product surface-area impact" and `references/technical-design-playbook.md` "Internal surface-area map."
- Map the **user journey(s)** and "what success looks like" (product).
- Map the **current system behavior** and constraints end-to-end (technical). As you trace current behavior, persist factual findings to `evidence/` immediately — don't wait for the world model to be complete (see `references/artifact-strategy.md` "Current system behavior discovered").
- Create a **Consumer Matrix** when there are multiple consumption modes (SDK, UI, API, internal runtime, etc.).
- **When the design depends on third-party code** (packages, libraries, frameworks, external services): dispatch `general-purpose` Task subagents to investigate each key 3P dependency — scoped to the spec's scenario and the capabilities under consideration, not a general survey. Include a sanity check: is this the right 3P choice, or is there a better-suited alternative? Persist findings to `evidence/`. See `references/research-playbook.md` "Third-party dependency investigation" for scope and execution guidance.
- **When the spec touches existing system areas** (current behavior, internal patterns, blast radius): dispatch `general-purpose` Task subagents that load `/explore` skill to build structured codebase understanding — pattern lens for conventions and prior art, tracing lens for end-to-end flows and blast radius, or both. Scope to the spec's areas of interest, not the entire codebase. Each subagent returns a pattern brief or trace brief inline; persist load-bearing findings to `evidence/`. See `references/research-playbook.md` investigation types B, C, and F for what to investigate.

**Subagent dispatch:** When a Task subagent needs a skill, use the `general-purpose` type (it has the Skill tool). Start the subagent's prompt with `Before doing anything, load /skill-name skill`, then provide context and the task.

**Load (for technique):**
- `references/technical-design-playbook.md`
- `references/product-discovery-playbook.md`
- `templates/CONSUMER_MATRIX.md.template`
- `templates/USER_JOURNEYS.md.template`

Output:
- A draft "current state" narrative (what exists today)
- A draft "target state" narrative (what should exist)
- A **product surface-area map** (which customer-facing surfaces this feature touches)
- An **internal surface-area map** (which internal subsystems this feature touches)
- A list of key constraints (internal + external)

**After building the world model**, sketch the system for shared understanding:
- Generate a **system context diagram** (Mermaid or D2) showing boundaries, consumers, and key dependencies.
- Generate **sequence diagrams** for the primary happy path and the most important failure path.
- Present these to the human: "Here's my understanding of the system — what's wrong or missing?" Update based on their corrections.

These are conversation tools, not deliverables. Generate them when the design involves multiple components or services — not for trivial single-surface changes.

---

### 4) Convert uncertainty into a prioritized backlog
**Load:** `references/decision-protocol.md`

Do:
- **Systematic extraction (not free recall):**
  Do not generate open questions from memory. Audit the world model from Step 3 through three probes:

  1. **Walk-through:** For each element in the world model — each requirement, goal, persona, surface, dependency, and assumption — ask: *What's uncertain? What's assumed but unverified? What edge cases or failure modes haven't been addressed?*
  2. **Tensions:** Where do different dimensions create conflicting requirements or constraints? Where does the product need and the technical reality diverge?
  3. **Negative space:** What's conspicuously absent from the world model? What hasn't been discussed? What would a skeptical reviewer, SRE, or security engineer flag?

  **Extraction discipline:** List every candidate without filtering for importance. Do not evaluate "is this significant enough?" during extraction — that happens during tagging (below). A thin or absent area in the world model is itself an open question. If the initial backlog feels tidy and balanced, you are filtering during extraction.

  This is the first pass, not the final inventory. The backlog grows throughout the process — through investigation, user context, and decision cascades. A backlog that only shrinks is a red flag.

- Classify every extracted item into the backlog:
  - **Open Questions** (need research/clarification)
  - **Decisions** (need a call)
  - **Assumptions** (temporary scaffolding; must have confidence + verification plan + expiry)
  - **Risks / Unknowns** (downside + mitigation)
- Tag each item:
  - Type: Product / Technical / Cross-cutting
  - Priority: P0/P1/P2
  - Reversibility: 1-way door vs reversible
  - Blocking: blocks Phase 1 or not
  - Confidence: HIGH / MEDIUM / LOW

Then:
- For each Open Question, identify investigation paths that would help resolve it.
- **Investigate P0/blocking items autonomously** — run code traces, dependency checks, prior art searches, blast radius analysis. Persist findings to `evidence/` as you go.
- After investigating, present the first **Decision Batch** (numbered) and **Open Threads** (remaining unknowns with investigation status and action hooks). See Output format §2-§3.

---

### 5) Run the iterative loop: investigate → present → decide → cascade
This is the core of the skill. Repeat until Phase N is fully scoped.

**Load (before presenting decisions):** `references/evaluation-facets.md`
**Load (for behavioral patterns):** `references/traits-and-tactics.md`
**Load (for investigation approach):** `references/research-playbook.md`
**Load (for challenge calibration):** `references/challenge-protocol.md`

Loop steps:
1. **Identify what needs investigation** — extract from the OQ backlog + cascade from prior decisions. Prioritize: P0 blocking items first.
2. **Investigate autonomously:**
   - **P0 / blocking:** Deep investigation — dispatch `general-purpose` Task subagents that load `/research` skill or `/explore` skill, multi-file traces, external prior art searches.
   - **P1:** Moderate investigation — direct file reads, targeted searches, quick dependency checks.
   - **P2 non-blocking:** Surface-level only — note the question, don't investigate deeply.
   - Before drafting options for any non-trivial decision, verify (by investigating, not by proposing):
     - [ ] Current system behavior relevant to this decision: checked.
     - [ ] How similar systems solve this: checked.
     - [ ] Dependency capabilities verified from source (not assumed from docs).
   - **Persist findings as they emerge** — write to evidence files as soon as factual findings surface (new file, append, or surgical edit per the write trigger protocol in `references/artifact-strategy.md`). Route findings to the right bucket: spec-local `evidence/` for spec-specific context; existing or new `/research` reports for broader findings. This is agent discipline, not something to announce.
3. **Determine stopping point** — stop investigating when:
   - Evidence is exhausted (you've investigated everything accessible for the current priority tier).
   - You hit a **judgment gap** — a question that requires product vision, priority, risk tolerance, or scope decisions from the user.
   - You hit a **1-way door** requiring explicit user confirmation.
   - Convert investigation results into **decision inputs** before presenting:
     - **What we learned**
     - **What constraints this creates**
     - **What options remain viable**
     - **Recommendation + confidence + what would change it**
     (Use the format in `references/research-playbook.md`.)
   **When investigation surfaces architectural or scale-relevant decisions**, generate supporting artifacts to sharpen the conversation:
   - **Napkin math** when scale, performance, or cost is a factor — order-of-magnitude estimates (requests/sec, storage growth, latency budget, cost at 10x) that test whether the proposed design holds.
   - **Failure mode inventory** when the design involves distributed systems or critical paths — what fails, how it's detected, what users experience, what the mitigation is.
   - **At least one counterproposal** for major architectural decisions — a simpler or different approach that the human must engage with ("Here's a simpler approach that gives up X but avoids Y. Why is the extra complexity worth it?"). Only when your investigation genuinely surfaces a viable alternative, not as a checkbox.
4. **Present findings + decisions + open threads** using the output format (§1-§4 below).
5. **User responds** — with decisions (§2), "go deeper on N" (§3), or new context.
6. **Cascade decisions → update artifacts → identify newly unlocked items:**
   - **Cascade analysis:** Trace what the decision affects — assumptions, requirements, design, phases. Default to full transitive cascade; flag genuinely gray areas to user; treat uncertainty about whether a section is affected as a signal to investigate more, not to skip it.
     Scan these implication categories to catch non-obvious effects: **incentive** (does this change what behavior the system rewards?), **precedent** (does this set a pattern future work will follow?), **constraint** (does this foreclose options elsewhere?), **resource** (does this compete for budget, capacity, or attention?), **information** (does this change what's observable or debuggable?), **timing** (does this create sequencing dependencies?), **trust** (does this shift security or permission boundaries?), **reversibility** (does this make a future change harder?).
   - **Persist all confirmed changes** per the write trigger protocol (`references/artifact-strategy.md`):
     - Append to Decision Log (SPEC.md §10)
     - Surgical edit all affected SPEC.md sections (requirements, design, phases, assumptions, risks)
     - If an assumption is refuted, trace and edit all dependent sections
     - Append new cascading questions to Open Questions (SPEC.md §11)
     - Update evidence files if the decision changes factual understanding
   - Re-prioritize the backlog
   - **Completeness re-sweep** (every 2-3 loop iterations, or after a cluster of decisions resolves): Re-run the three extraction probes from Step 4 against the current state of the spec. Decisions change the shape of the problem; new dimensions may now be relevant that weren't before. A backlog that only shrinks is a signal you're not probing deeply enough. For each major decision made this round, reverse the question — what *should* be affected but hasn't been traced? What areas are suspiciously untouched?
   - **Introspective checkpoint** (same cadence as completeness re-sweep): Before presenting the next batch, run these self-checks silently — they're agent discipline, not user-facing output. Flag any that fire:
     - **Convergence:** Are options narrowing because evidence supports it, or because the agent stopped looking?
     - **Confirmation bias:** Is the agent seeking evidence for its preferred direction while under-investigating alternatives?
     - **Anchoring:** Is the first option considered getting disproportionate weight? Has the agent genuinely evaluated alternatives on their merits?
     - **Known unknowns:** What questions has the agent *not* asked yet? What dimensions of the problem remain unexplored?
     - **Defensibility:** If a skeptical reviewer saw the current recommendation, what's the strongest objection — and has the agent addressed it?
   - **Goto step 1** with newly unlocked items.
7. **Artifact sync checkpoint** (before responding to the user):
   Verify all changes from this turn have been persisted:
   - [ ] Factual findings from this turn written to evidence files?
   - [ ] SPEC.md sections affected by decisions or findings updated?
   - [ ] Decision Log, Open Questions, Assumptions tables current?
   - [ ] `meta/_changelog.md` entry appended for all substantive changes?
   - [ ] Interpretive insights needing user input routed to §2/§3 of your response (not written to files prematurely)?

---

### 6) Phase planning: validate architecture, then ship product
**Load:** `references/phasing-and-deferral.md`

Do:
- Define phases by **risk reduction and validation**, not just feature completeness.
- **Phase 1 is always present. Phase 2+ must earn their way in** — if you can't write concrete acceptance criteria, assign an owner, and state a timeframe, it's a deferral, not a phase. Use the qualification test and decision aid in the reference.
- Scale to the feature: a small feature with Phase 1 + documented deferrals is often the right shape. Don't manufacture phases.
- Distinguish:
  - **Technical milestone** (validates architecture internally)
  - **Product milestone** (first user value, onboarding, docs, UX)
- For each phase:
  - goals and non-goals
  - scope
  - acceptance criteria
  - owners and next actions
  - blockers + plan to resolve or explicitly defer
  - biggest risks + mitigations
  - what gets instrumented/measured

After phase decisions are finalized, persist to SPEC.md (phases, Decision Log, deferrals) and log the changes to `meta/_changelog.md`.

---

### 7) Technical accuracy verification (opt-in, after content is stable)

**Trigger:** All P0 open questions are resolved, phase planning is done, and no pending decisions remain. The spec's content is stable — further changes would be corrections, not new design.

When you reach this point, proactively offer:
> "All open questions and design decisions are resolved. Before we sign off, would you like me to do a thorough accuracy check — verifying every technical assertion in the spec against the current codebase and dependency state?"

If the user declines, skip to Step 8 (Quality bar).

If the user accepts:

#### Step 1: Refresh the codebase
Run `git pull origin main` (or the relevant base branch) so you are verifying against the latest code, not the state from when the spec process started.

#### Step 2: Extract assertions
Scan the SPEC.md for every technical claim that maps to verifiable reality. Focus on load-bearing claims — not every word, but anything the design relies on:
- Claims about current system behavior ("the auth middleware does X", "requests flow through Y")
- Claims about dependency capabilities ("library Y supports Z", "the SDK exposes method W")
- Claims about API shapes, types, interfaces, or configuration options
- Claims about codebase patterns ("we use pattern X in similar areas", "existing endpoints follow convention Y")
- Claims about third-party behavior, limitations, or version-specific details

#### Step 3: Dispatch parallel verification
Categorize assertions and dispatch subagents in parallel:

| Track | Tool | Scope |
|---|---|---|
| Own codebase (behavior, patterns, blast radius) | `general-purpose` Task subagents that load `/explore` skill | Verify each assertion against current code. Each subagent gets the specific claim + relevant file paths or areas. |
| Third-party dependencies (capabilities, types, behavior) | `general-purpose` Task subagents that load `/research` skill | Verify against current source/types/docs for each dependency, scoped to the spec's scenario. |
| External claims (prior art, ecosystem conventions) | `general-purpose` Task subagents that load `/research` skill, or web search | Spot-check factual claims about external systems or ecosystem patterns. |

#### Step 4: Present findings (do not auto-correct)
This step is purely analytical. Report findings to the user — do not edit the spec.

For each verified assertion, classify:
- **CONFIRMED** — verified from primary source. No action needed.
- **CONTRADICTED** — evidence shows the spec is wrong. Detail what the spec says vs. what is actually true.
- **STALE** — was true when written but the codebase or dependency has changed since. Detail the drift.
- **UNVERIFIABLE** — cannot confirm or deny from accessible sources. Note what was checked.

Present the summary in two tiers:

**Tier 1 — Design-affecting issues:** Any contradiction or staleness that could change a product decision, invalidate a requirement, affect phasing, or alter the recommended architecture. These are not just fact corrections — they may reopen design questions. Present each as a candidate Open Question or Decision using the existing spec format (type, priority, blocking, what it affects).

**Tier 2 — Factual corrections:** Contradictions or staleness that are localized — the fix is updating a detail in the spec without affecting any design decisions. List each with the current (wrong) claim and the correct information.

Also note the UNVERIFIABLE assertions so the user is aware of remaining uncertainty.

#### Step 5: User decides next steps
Ask the user how to proceed:

- **Tier 1 items** (design-affecting): If the user confirms any as genuine issues, add them to the spec's Open Questions or Decision Log and **return to Step 5 (iterative loop)** to work through them using the normal investigate → present → decide → cascade process. The spec process continues until these are resolved.
- **Tier 2 items** (factual corrections): If the user approves, apply the corrections as surgical edits to SPEC.md and log them to `meta/_changelog.md`.
- **No issues found**: Proceed to Step 8 (Quality bar).

---

### 8) Quality bar + "are we actually done?"
**Load:** `references/quality-bar.md`

Do:
- Run the must-have checklist.
- If any "High-stakes stop and verify" trigger applies, treat should-have items as must-have unless the user explicitly accepts the risk.
- Confirm traceability:
  - Every top requirement maps to a design choice and plan
  - Every design decision explains user impact
  - 1-way-door decisions have explicit confirmation + evidence references
- Ensure deferrals are documented (not just "later" bullets).
- Verify artifact completeness: `evidence/` files reflect all factual findings from the spec process, `meta/_changelog.md` captures all decisions and changes, and SPEC.md reads as a clean current-state snapshot with no stale sections.
- Use the Phase completion gate to decide whether the current phase is ready to implement.

---

## Output requirements

### Interactive iteration output (default per message)
When you are mid-spec, structure your response like this:

#### §1) Current state (what we believe now)
- 3-8 bullets max, enriched by autonomous investigation.

#### §2) Items needing your input (numbered batch)
Everything the user needs to respond to this turn — decisions with formed options AND judgment calls where the agent needs human input (product vision, priority, risk tolerance, scope). Each item appears in §2 or §3, never both. If it needs user input, it belongs here.

- **Decisions** (formed options): format per `references/decision-protocol.md` — confidence level determines presentation depth (HIGH = stated intention, MEDIUM = full options, LOW = full context).
- **Judgment calls** (no formed options yet): investigation findings so far + why the agent can't narrow further + ask directly + what the answer unlocks.

#### §3) Tracked threads (○ items only — numbered)
Items the agent is tracking that don't need user input this turn. Only **○ Can investigate further** items belong here — the agent stopped (diminishing returns, lower priority, or time cost) but could go deeper if directed.

For each thread:
- The question (tagged: type, priority, blocking?)
- **Investigation status:** What the agent already checked + what it found (brief — substance, not mechanics).
- Unlocks: what decision or downstream clarity this enables once resolved.

§3 may be omitted if there are no ○ threads.

At the bottom of §3 (if present):
> Say "go deeper on N" for any threads you want investigated further.

#### §4) What evolved
- 2-5 bullets: what shifted in understanding this turn and why it matters for the spec's direction.
- Focus on decision-relevant substance, not file operations. Artifacts update silently as agent discipline.
- Include a brief breadcrumb of what was captured (e.g., "traced the auth flow and updated the spec's current state section") — not a formal file manifest.

### Finalization output
When the user says "finalize":
1. Run a final artifact sync checkpoint (same as Step 5, item 7).
2. Ensure `meta/_changelog.md` has a session-closing entry with any pending items carried forward.
3. Return the full `SPEC.md` (PRD + Technical Spec) in one standalone artifact.

---

## Anti-patterns
- Treating product and tech as separate tracks (they must stay interleaved).
- Giving "confident" answers without verifying current behavior or dependencies.
- Letting scope drift without documenting the deferral tradeoff.
- Skipping blast-radius analysis (ops, observability, UI impact, migration).
- Writing a spec that is not executable (no phases, no acceptance criteria, no risks).
- **Accepting the user's first framing without validation.** The initial problem statement may be incomplete or biased toward one solution. Push for specificity even when the user seems confident.
- **Proposing investigation instead of doing it.** If information is accessible (code, dependencies, web, prior art), investigate autonomously — don't stop to ask permission. Match tool to scope: a function name lookup doesn't need `/research`; a multi-system trace does. But in both cases, do it rather than proposing it. Stop only for genuine judgment gaps (product vision, priority, risk tolerance, scope decisions).
- **Letting the user skip problem framing.** Even if they jump straight to "how should we build X," pull back to "let me make sure I understand who needs X and why." Step 1 is not optional.
- **Letting insights accumulate only in conversation without persisting to files.** If you learned something factual (code trace, dependency behavior, current state), it belongs in an evidence file now — not "later" or "when we finalize." Conversation context compresses; artifacts survive.
- **Under-extracting open questions (balance fallacy).** The agent generates open questions and silently filters for importance during extraction — listing only items that feel "significant enough." The result is a comfortable handful that looks balanced but reflects the agent's significance threshold, not reality. Fix: separate extraction from prioritization. List every candidate uncertainty; use the tagging step (P0/P1/P2) to prioritize, not the extraction step to filter.
- **Directing the human to do async work.** Never say "go check with team X," "run an experiment," "talk to customers about this." If you need information the human might have, ask about what they know or think. If you need external information, investigate it yourself using code, web, and docs.
- **Questioning the human's process instead of probing their thinking.** Don't ask "Have you talked to customers?" or "Have you validated this with users?" Instead, propose options and ask about intent: "Do you want customers to be able to do X? One alternative is Y, which might satisfy the need because Z."

---

## Examples

### Incorrect (reactive, ungrounded)
```txt
We should do Option A. It's standard and should work.
```

### Correct (evidence-backed decision after autonomous investigation)

```txt
Decision 2 (Cross-cutting, 1-way door): Public API shape for <feature>

Options:
A) Single endpoint ... → simplest onboarding, harder to evolve later
B) Two-step API ... → better DX for multiple consumers, more surface area now

Recommendation: B (high confidence)
- Why: aligns with multi-consumer needs; our existing SDK uses the two-step
  pattern for 3 of 4 analogous endpoints (evidence/sdk-api-patterns.md)
- External prior art: Stripe and Twilio both use two-step for similar surfaces
- Confidence: HIGH (verified from source + prior art alignment)
```

### Correct (open thread with investigation status)

```txt
3. [Technical, P0, blocks Phase 1] How does our auth middleware handle
   token refresh during long-running requests?

   Investigation status: Traced the token refresh path through auth
   middleware (evidence/auth-middleware-flow.md). The refresh is
   synchronous and blocks the request. No existing endpoint handles
   mid-request token expiry.
   ○ Can investigate further: Verify whether the session store supports
   concurrent refresh (haven't checked source/types yet). Say "go deeper
   on 3."

   Unlocks: Decision on whether we extend the existing refresh mechanism
   or build a new one for streaming endpoints.
```

### Correct (judgment call in §2 — needs user vision)

```txt
5. [Product, P0, blocks Phase 1] Which persona is the primary target
   for the initial onboarding flow?

   Investigation status: Found 3 distinct entry patterns in analytics
   (evidence/user-segments.md). Developer-first accounts are 68% of
   signups but Enterprise accounts drive 85% of revenue.
   ● Needs your input: This is a product strategy call — data supports
   either direction. Which segment aligns with this quarter's goals?

   Unlocks: Onboarding UX design, default configuration, and docs tone.
```

---

## Validation loop (use when stakes are high)

1. Identify which decisions are 1-way doors (public API, schema, security boundaries, naming).
2. For each 1-way door, ensure:

   * explicit user confirmation
   * evidence-backed justification (or clearly labeled uncertainty + plan)
3. Re-run the `references/quality-bar.md` checklists and triggers.
4. Stop only when Phase 1 is implementable and the remaining unknowns are explicitly recorded (and accepted by the user for this phase).
