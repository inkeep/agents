# Design Challenge Findings

## Challenge 1: Do we need just-bash? — PARTIALLY ACCEPTED
19 deps for rarely-used capabilities. Moved bash to Phase 2. Phase 1 uses minimal jq library only.

## Challenge 2: Is child process isolation justified? — ACCEPTED
Vercel incompatibility (audit H1) makes this moot for production. Phase 2 execution model TBD.

## Challenge 3: stdin doesn't avoid memory duplication — ACCEPTED
With child processes, IPC serializes data (creating a copy). The real benefit of stdin is statelessness, not memory savings. Spec language corrected.

## Challenge 4: Token cost unquantified — ACCEPTED
~300-350 tokens per call for bash tool schema. Added as Phase 2 prerequisite to measure before locking always-on.

## Challenge 5: Always-on is premature — ACCEPTED
Phase 1 ($jq in refs) has zero token cost. Phase 2 injection strategy TBD pending token cost analysis.

## Challenge 6: Enhance resolveArgs with $jq instead — ACCEPTED AS PHASE 1
This became the Phase 1 design. Smallest change, highest value, zero token cost, no new dependency beyond a jq library.

## Challenge 7: JMESPath extract tool first — ACCEPTED AS PHASE 1
Initially dismissed due to LLM reliability concerns with JMESPath. Later accepted when the zero-dependency argument won out: existing `jmespath` library + `sanitizeJMESPathSelector()` + `_structureHints` generating ready-to-use selectors mitigate the reliability concern. `$select` key is language-agnostic, allowing upgrade to jq later without API change.
