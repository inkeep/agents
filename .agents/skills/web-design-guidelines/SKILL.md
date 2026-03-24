---
name: web-design-guidelines
description: Review UI code for Web Interface Guidelines compliance. Use when asked to "review my UI", "check accessibility", "audit design", "review UX", or "check my site against best practices".
metadata:
  author: vercel
  version: "1.0.0"
  argument-hint: <file-or-pattern>
---

# Web Interface Guidelines

Review files for compliance with Web Interface Guidelines.

## How It Works

1. Load the guidelines (see Guidelines Source below)
2. Read the specified files (or prompt user for files/pattern)
3. Check against all rules in the guidelines
4. Output findings in the terse `file:line` format

## Guidelines Source

**In CI:** The workflow fetches the latest guidelines into `references/guidelines.md` before review. Read that file.

**Locally:** If `references/guidelines.md` doesn't exist, fetch from the upstream URL:
```
https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md
```

## Usage

When a user provides a file or pattern argument:
1. Try reading `references/guidelines.md` first (populated by CI)
2. If not found, use WebFetch or Bash (`curl`) to fetch from the upstream URL
3. Read the specified files
4. Apply all rules from the guidelines
5. Output findings using the format specified in the guidelines

If no files specified, ask the user which files to review.
