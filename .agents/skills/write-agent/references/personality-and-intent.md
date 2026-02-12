Use when: Writing the "Role & mission" section of an agent prompt; calibrating agent judgment and identity
Priority: P1
Impact: Agents over-interpret escape hatches; poorly framed personality leads to poor judgment in ambiguous situations

---

# Personality & Intent Statements for Agent Prompts

A personality statement gives the agent a **north star** when instructions are ambiguous. It answers: "What would the best version of this role do here?"

Done well, it pre-biases the agent toward excellent judgment. Done poorly, it gives the agent license to cut corners or over-apply rules.

---

## The asymmetry principle

LLMs over-generalize. Any escape hatch you provide will be used — often in contexts you didn't intend.

**Write personality that:**
- Declares what **great** looks like (the upside ceiling)
- Describes what the **best humans in this role** would do
- Is concrete about positive behaviors, not abstract virtues

**Avoid personality that:**
- Uses words that could excuse poor work ("pragmatic," "efficient," "fast," "good enough")
- Implies acceptable failures without clear anti-pattern framing
- Is so vague it could justify any behavior ("helpful," "smart," "thorough")

---

## Tradeoffs: when they're safe vs. risky

Tradeoff language ("X over Y") can be effective — but only when Y is **clearly an anti-pattern** that good judgment would also deprioritize.

### Safe tradeoffs (Y is an anti-pattern)

| Statement | Why it's safe |
|---|---|
| "Focus on issues that matter over cosmetic nitpicks" | Cosmetic nitpicks are genuinely low-value |
| "Provide actionable findings over vague concerns" | Vague concerns are genuinely unhelpful |
| "Understand the requirement fully over jumping straight to code" | Jumping straight to code is genuinely an anti-pattern |
| "Return concise findings over exhaustive dumps" | Exhaustive dumps are genuinely unhelpful |

### Risky tradeoffs (Y is actually valuable)

| Statement | Why it's risky |
|---|---|
| "Ship working code over perfect code" | "Perfect code" isn't an anti-pattern; this licenses sloppiness |
| "Move fast over being thorough" | Thoroughness is valuable; this licenses rushing |
| "Prioritize speed over correctness" | Correctness is valuable; this licenses bugs |
| "Be concise over being complete" | Completeness is valuable; this licenses omissions |

### The tradeoff test

Before using "X over Y" language, ask:

> "Would the best human in this role also deprioritize Y? Is Y genuinely an anti-pattern, or just sometimes inconvenient?"

If Y is sometimes the right choice, don't frame it as a tradeoff. Instead, provide guidance on *when* to choose each approach.

---

## Structure of a good personality statement

```
You are [role identity] who [what excellence looks like in practice].

You [concrete positive behavior].
You [concrete positive behavior].
You [concrete positive behavior — can include safe tradeoff].
```

### Example: Security reviewer

```
You are a security-focused reviewer who identifies vulnerabilities before they reach production.

You examine code changes through an attacker's lens, considering how inputs could be manipulated.
You distinguish between theoretical risks and exploitable vulnerabilities, prioritizing findings by real-world impact.
You provide specific, actionable remediation guidance — not vague warnings.
```

### Example: Implementation agent

```
You are a careful implementer who writes code that works correctly the first time.

You understand the requirement fully before writing code.
You handle edge cases and error conditions, not just the happy path.
You write code that the next developer can read and modify confidently.
```

### Example: Code reviewer

```
You are a reviewer who catches the issues that matter most.

You focus on correctness, security, and maintainability over stylistic preferences.
You provide specific, actionable feedback with clear rationale.
You calibrate feedback intensity to issue severity — critical issues get emphasis, minor suggestions stay brief.
```

### Example: Research agent

```
You are a researcher who finds accurate, relevant information efficiently.

You verify claims against primary sources when stakes are high.
You distinguish between established facts, reasonable inferences, and speculation.
You surface what's most relevant to the question over exhaustive coverage.
```

---

## The "best human" test

Before finalizing a personality statement, ask:

> "If the best human in this role read this description, would they nod in recognition — or wince at a caricature?"

The best security reviewers don't "miss nitpicks" — they triage effectively.
The best implementers don't "ship over polish" — they scope appropriately and deliver quality within that scope.
The best reviewers don't "avoid details" — they focus attention where it matters.

If your personality statement sounds like a shortcut rather than excellence, revise it.

---

## When personality conflicts with instructions

Personality is a **tiebreaker for ambiguous situations**, not an override for explicit guidance.

Make this hierarchy explicit in the agent prompt when needed:

```
When instructions are specific, follow them exactly.
When instructions are ambiguous, use your judgment as [role] would.
```

---

## Common failure modes to avoid

### 1. Vague virtue statements

❌ "You are helpful, thorough, and careful."

These don't guide behavior — they're too abstract to shape decisions.

✅ "You identify the issues that would cause the most user pain and flag them clearly."

### 2. Escape-hatch language

❌ "You are pragmatic and focus on what matters most."

"Pragmatic" and "what matters most" are infinitely interpretable — the agent will use them to justify whatever it wants to do.

✅ "You address correctness and security issues completely; you note style issues briefly without blocking on them."

### 3. Caricature personalities

❌ "You are an obsessive perfectionist who catches every possible issue."

This encourages over-flagging and nitpicking.

✅ "You catch the issues that would cause real problems in production. You calibrate effort to impact."

### 4. Conflicting signals

❌ "You are fast and thorough. You move quickly but never miss important details."

These goals are in tension; the agent will pick one arbitrarily.

✅ "You focus your time on high-impact areas. In those areas, you are thorough. Outside them, you note concerns briefly and move on."

---

## Integrating personality with the rest of the prompt

Personality belongs in the **Role & mission** section (first 2-4 sentences of the agent body). It sets the frame for everything that follows.

The rest of the prompt then provides:
- **Scope & non-goals** — boundaries that personality operates within
- **Workflow** — concrete steps that personality informs but doesn't override
- **Output contract** — structure that channels personality into useful outputs
- **Guardrails** — explicit rules that take precedence over personality-based judgment

A well-written agent prompt has personality and structure working together: personality guides judgment in gaps; structure ensures consistency in outputs.
