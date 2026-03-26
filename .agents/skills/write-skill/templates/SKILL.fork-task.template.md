Use when: Skills that run as isolated subagents (`context: fork`)
Priority: P1
Impact: Incomplete task prompt; empty output; wrong agent type

---

---
name: <skill-name>
description: <Runs an isolated task in a subagent. Use when...>
context: fork
agent: Explore
allowed-tools: Read, Grep, Glob, Bash
argument-hint: "[task input]"
---

You are running in an isolated subagent.

## Task
Do the following for: $ARGUMENTS

## Inputs to gather
- <what to read>
- <what to search>
- <what commands to run>
- If given large unstructured artifacts (notes/logs/transcripts), first triage relevance to the task.

## Output requirements
Return Markdown that is standalone and scannable.

## Summary
...

## Evidence
- File:line → finding

## Recommendations
1. ...
2. ...
