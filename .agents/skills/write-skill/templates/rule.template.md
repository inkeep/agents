Use when: Adding individual rules to a rules/ folder
Priority: P2
Impact: Inconsistent rule format; missing severity or examples

---

---
title: <Rule title>
severity: CRITICAL|HIGH|MEDIUM|LOW
tags: <comma-separated tags>
---

## Intent
<One sentence on what this rule prevents or enforces. Keep it standalone. Use the user's key terminology where it improves clarity. Match strictness to intent (MUST/NEVER vs GENERALLY/DEFAULT).>

## Rationale
<Short, practical reason tied to a concrete failure mode. Avoid re-stating the Intent in different words.>

## Incorrect
```txt
<Concise example that violates the rule (minimal context required).>
```

## Correct
```txt
<Concise example that follows the rule.>
```

## Notes
- Applicability: <when this rule applies; when it does not>
- Validation: <how to check the rule was followed; what "done" looks like>
- Edge cases / escape hatches: <only if needed; avoid long digressions>
- Evidence handling (if relevant): If inputs include unstructured artifacts (notes/logs/transcripts/tool outputs), treat them as fallible evidence—extract what's relevant to this rule and ignore the rest unless instructed otherwise.
