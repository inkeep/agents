Use when: Refining the problem definition, personas, user journeys, requirements, success metrics, and product surface-area impact.
Priority: P0
Impact: You build the wrong thing; the spec lacks user value; tech decisions aren't grounded in real workflows.

---

# Product discovery playbook

## The integrated stance
You are not doing "product first, then tech."
You are refining a single world model where product constraints and technical constraints co-create the solution.

## Required outputs (minimum)
- Problem statement (what pain, for whom, why now)
- Personas / consumer types (specific, not "users")
- One end-to-end user journey per primary persona
- Requirements (prioritized, with acceptance criteria)
- Success metrics + instrumentation plan
- Product surface-area impact map (what UIs, APIs, docs, onboarding change)

## Persona discipline
For each persona, capture:
- Job-to-be-done
- Current workflow
- Pain points / blockers
- Workarounds (what they do today)
- Trust/security sensitivities
- What "success" looks like (observable)

## User journey mapping (happy path + failure path)
For each primary persona:
1) Discovery (how they learn this exists)
2) Setup (steps, prerequisites, what can go wrong)
3) First use (the "aha moment")
4) Ongoing use (daily workflow)
5) Failure/debug (what breaks, what they see, how they recover)
6) Growth (advanced usage)

## Requirements that survive implementation reality
Write requirements as:
- **Must / Should / Could**
- include acceptance criteria
- include "failure experience" requirements (errors, recovery, supportability)

## Product prior art
Research:
- how comparable products explain this
- how they onboard users
- what their default configurations are
- what users complain about publicly

Turn prior art into:
- expectations we must meet (table stakes)
- gaps we can differentiate on
- pitfalls we should avoid

## Product surface-area impact
**Load (in parallel, if available):** `/product-surface-areas` and `/audience-impact`. These are complementary dimensions — the surface-area skill catalogs *what changes*, while audience-impact identifies *who is affected and how fast impacts propagate* (especially silent impacts that reach audiences without obvious signal). Load both together; synthesize their outputs into a unified view.

Use `/product-surface-areas` as the baseline map and identify which surfaces this feature touches — including transitive dependencies via the catalog's impact matrix or dependency graph. Fill gaps only for surfaces the catalog doesn't cover.

**If `/product-surface-areas` is not available**, create a map of surfaces impacted:
- dashboard/admin UI
- API endpoints
- SDK methods
- CLI commands (if any)
- docs/onboarding
- error messages
- billing/limits (if relevant)
- telemetry/analytics (product + ops)

For each surface:
- what changes
- why it matters to the user
- what must be consistent (naming, mental model)

## Naming is a product decision
Treat naming as:
- a user mental-model contract
- a likely 1-way door if it appears in public APIs/docs/URLs

If naming is uncertain:
- propose 2-4 options
- show how each appears across surfaces (UI label, API field, CLI command)
- pick the simplest consistent mental model

## First-contact legibility
Design for someone encountering this feature for the first time with no prior context:
- Would a customer understand what a new field, flag, or method does from the name alone?
- Are defaults tuned for the common case — does it work out-of-the-box without configuration?
- Are errors actionable — do they tell the customer what happened AND what to do next?
- Can the customer discover and use this without reading source code?

First-contact legibility applies to every customer-facing surface: API fields, config keys, CLI flags, error messages, docs headings, log output. If the design requires explanation to use correctly, the design should change — not the docs.
