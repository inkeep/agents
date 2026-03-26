Use when: Deciding folder structure (single-file vs references/ vs scripts/ vs rules/)
Priority: P0
Impact: Poor progressive disclosure; bloated SKILL.md; orphaned supporting files

---

# Structure Patterns

This reference helps you choose a skill folder structure that's easy to maintain and efficient for context.

## General guidance

- Keep `SKILL.md` as the **primary "how to do it" guide**.
- Use other files for **deep detail**, **deterministic code**, or **bulk rule sets**.
- Prefer one level of file references from `SKILL.md` (avoid chains).

---

## Pattern 1: Single-file skill

```
my-skill/
└── SKILL.md
```

**Use when**
- the whole workflow fits cleanly
- there isn't much reference material
- there are few edge cases

**Common mistake**
- stuffing large knowledge dumps into SKILL.md (hard to route + bloats context)

---

## Pattern 2: SKILL.md + references/

```
my-skill/
├── SKILL.md
└── references/
    ├── api.md
    ├── schema.md
    └── troubleshooting.md
```

**Use when**
- there are large specs or schemas
- you need occasional deep detail
- you want SKILL.md to stay procedural and short

**Best practice**
- In SKILL.md, tell the agent *when* to read each reference.
- Keep references chunked by topic (smaller files load better).

---

## Pattern 3: SKILL.md + scripts/

```
my-skill/
├── SKILL.md
└── scripts/
    ├── validate.py
    └── transform.py
```

**Use when**
- the skill needs deterministic steps
- validation matters
- you don't want to re-implement the same code repeatedly

**Best practice**
- Scripts should be robust: good error messages, explicit dependencies.
- SKILL.md should include a "run script → interpret output" loop.

---

## Pattern 4: Index skill + rules/

```
my-skill/
├── SKILL.md
└── rules/
    ├── _template.md
    ├── rule-a.md
    ├── rule-b.md
    └── ...
```

**Use when**
- you have many discrete rules that share a consistent structure
- you want priority ordering
- you want on-demand loading of just the relevant rule

**Best practice**
- Make SKILL.md an index: priorities, categories, selection guidance.
- Make each rule file short and consistent (incorrect/correct pairs help).

---

## Pattern 5: Forked execution skill (task skill)

```
my-skill/
└── SKILL.md   # includes context: fork and a complete task prompt
```

**Use when**
- you want the skill to behave like a "command that runs a subagent"
- you want isolation
- you need a specific tool environment (Explore/Plan)

**Best practice**
- Ensure the skill body contains:
  - inputs it needs (or how to gather them)
  - output format requirements
  - explicit "return summary" guidance

---

## Pattern 6: Multi-variant skills (providers / languages / frameworks)

Prefer:
- one skill with a short "selection" section in SKILL.md
- separate reference files per variant

Example:
```
deploying/
├── SKILL.md
└── references/
    ├── aws.md
    ├── gcp.md
    └── azure.md
```

**Use when**
- variants are substantial
- you don't want to load irrelevant detail

---

## File naming guidance

Choose names that are easy to grep and easy to reference:
- `references/schema.md`
- `references/faq.md`
- `scripts/validate.py`
- `rules/cache-waterfalls.md`

Avoid:
- `misc.md`
- `notes2.md`
- `final_final.md`
