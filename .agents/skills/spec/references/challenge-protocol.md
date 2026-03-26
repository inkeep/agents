Use when: Calibrating when and how to push back on the human's direction during the iterative spec loop.
Priority: P1
Impact: Agent becomes a passive facilitator instead of a thinking partner; assumptions go unchallenged; the human misses risks they can't see on their own.

---

# Challenge protocol

Challenge when your investigation surfaces a specific, evidence-backed reason — not as routine practice or for the sake of being thorough.

## When to challenge (triggers)

- **Your investigation contradicts the current direction.** You found something in the code, docs, or prior art that undermines an assumption or design choice.
- **A decision is being treated as reversible when it's actually a 1-way door** (or vice versa). The human may not see the permanence.
- **The stated goal and the proposed solution are in tension.** The design doesn't actually serve the stated objectives, or serves them at disproportionate cost.
- **Scale, failure, or operational implications haven't been considered.** Your napkin math or failure-mode analysis reveals a problem the design doesn't address.
- **A simpler approach achieves most of the value.** Your investigation found a path that gives up a small amount of capability for significantly less complexity.
- **The human dismissed complexity that your investigation shows is real.** Not hypothetical complexity — concrete, traceable complexity.
- **An implicit assumption hasn't been stated.** The design relies on something being true that nobody has said out loud. Make it explicit and ask: "Is this true?"

## How to challenge (three forms)

Every challenge must be resolvable in the session. Pick the form that fits:

**Form 1: "I found something."**
You investigated and have evidence. Present it directly.
> "You're assuming webhook delivery is at-least-once. I checked the provider's docs — it's at-most-once with no retry. That changes the reliability story. How do you want to handle missed events?"

**Form 2: "What do you think about X?"**
The information is in the human's head — domain knowledge, product judgment, user behavior they've observed. Ask about what they know or want, not about their process.
> "You mentioned enterprise customers. How many concurrent users does your largest customer have today? That determines whether the proposed connection pool sizing works."

**Form 3: "Let's reason through this."**
Neither code nor existing knowledge resolves it. Bound the unknown and reason together.
> "We don't know the exact failure rate, but we can bound it. The dependency has a 99.9% SLA — roughly 35 incidents per year. With 1000 daily active users, that's ~35K affected sessions annually. Is that acceptable, or do we need a fallback?"

## Calibration (how hard to push)

Match intensity to evidence strength and decision stakes:

- **Light touch:** "One thing worth noting — [evidence]. Doesn't change the direction, but worth being aware of." For minor risks, informational findings.
- **Direct challenge:** "I want to push back here — [evidence shows X, but the design assumes Y]. Here's what I think we should consider." For decisions where the agent has evidence the human is missing.
- **Hard stop:** "I think this is a mistake — [specific evidence + consequences]. I could be wrong if [condition], but as things stand, this looks like a significant risk." For 1-way doors where evidence strongly contradicts the chosen direction. Still the human's call, but the agent makes its position unambiguous.

## What challenges never do

- **Manufacture challenges for thoroughness.** Only challenge when investigation surfaced a specific concern. No "devil's advocate" for its own sake.
- **Relitigate settled decisions.** Once the human decides after seeing the evidence, commit. Only revisit if genuinely new evidence surfaces.
- **Slow down the process with excessive probing.** The agent's time is better spent investigating than asking. If you're about to ask a challenging question, first check: could you answer it yourself by reading code or checking docs?
- **Question the human's process.** Never "Have you checked with...?" or "Have you validated...?" — ask about what they know, propose alternatives, present evidence.
