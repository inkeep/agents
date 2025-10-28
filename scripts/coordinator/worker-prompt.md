# Linear Ticket Work Instructions

You are working on a Linear ticket as part of an automated workflow. Please follow these instructions carefully.

## Ticket Information

**Ticket ID:** {{TICKET_ID}}
**Title:** {{TICKET_TITLE}}
**URL:** {{TICKET_URL}}
**Status:** {{TICKET_STATUS}}
**Priority:** {{TICKET_PRIORITY}}
**Assignee:** {{TICKET_ASSIGNEE}}

## Description

{{TICKET_DESCRIPTION}}

## Labels

{{TICKET_LABELS}}

## Your Task

Please implement the requirements described in the ticket above. Follow these guidelines:

### 1. Understanding the Requirements
- Read the ticket description carefully
- If requirements are unclear, make reasonable assumptions and document them
- Check for any linked issues or related context

### 2. Implementation
- Follow the project's coding standards (see AGENTS.md)
- Write clean, well-tested code
- Add necessary tests for your changes
- Ensure all existing tests pass
- Run type checking and linting

### 3. Progress Updates

**IMPORTANT:** Update Linear with your progress at key milestones:

- When you start working: Post a comment saying you've started
- After completing major steps: Post progress updates
- If you encounter blockers: Post a comment describing the issue
- When tests pass: Post a comment with test results
- When ready for review: Post a final summary comment

To update Linear, use the Linear MCP tools available to you:
- `mcp__Linear__create_comment` to post comments
- `mcp__Linear__update_issue` to change status

Example comment format:
```
🤖 Bot Update: [Status]

Progress:
- ✅ Completed: [what you finished]
- 🔄 In Progress: [what you're working on]
- ⏭️ Next: [what's coming next]

[Any additional context or notes]
```

### 4. Create Pull Request

When your work is complete and all checks pass:

1. Commit your changes with a descriptive message
2. Push your branch to the remote
3. Create a PR using `gh pr create` with this format:

**PR Title:** `feat: {{TICKET_ID}} - {{TICKET_TITLE}}`

**PR Body:**
```markdown
## Summary
[Brief description of changes]

## Linear Ticket
Closes {{TICKET_URL}}

## Changes
- [List key changes]

## Testing
- [Describe how to test]
- [List test commands run]

## Checklist
- [ ] Tests added/updated
- [ ] Documentation updated (if needed)
- [ ] All tests passing
- [ ] Type checking passing
- [ ] Linting passing
```

### 5. Update Linear Ticket

After creating the PR:
1. Post a comment with the PR link
2. Update ticket status to "In Review" (if configured)

### 6. Error Handling

If you encounter errors or blockers:
1. Post a comment to Linear describing the issue
2. Include relevant error messages
3. Suggest potential solutions or next steps
4. Do NOT change ticket status to "Done" if blocked

## Development Workflow

### Standard Commands
```bash
pnpm test              # Run tests
pnpm typecheck         # Type checking
pnpm lint              # Run linter
pnpm build             # Build project
```

### Before Creating PR
1. Ensure all tests pass: `pnpm test`
2. Ensure type checking passes: `pnpm typecheck`
3. Ensure linting passes: `pnpm lint`
4. Ensure build succeeds: `pnpm build`

### Git Workflow
You are working in a dedicated git worktree. Your changes are isolated from other work.

**IMPORTANT:** Do NOT commit coordinator-generated files (`.claude-coordinator-*`) to your branch.

```bash
git status                              # Check status
git add <specific-files>                # Stage ONLY your changes (not coordinator files)
git commit -m "message"                 # Commit (follow AGENTS.md commit guidelines)
git push -u origin {{BRANCH}}           # Push to remote
```

**Note:** When committing:
- Follow commit message guidelines in AGENTS.md
- Use conventional commit format (feat:, fix:, chore:, docs:)
- Do NOT include AI-generated markers in commit messages
- Only commit files related to your implementation

## Success Criteria

Your work is complete when:
- ✅ Requirements are implemented
- ✅ Tests are written and passing
- ✅ Code is type-safe and linted
- ✅ PR is created with proper description
- ✅ Linear ticket is updated with PR link
- ✅ No blockers or errors remain

## Notes

- This worktree will be cleaned up automatically after PR is merged
- If you need to coordinate with other tickets, use Linear comments
- Focus on completing this specific ticket - don't refactor unrelated code
- Follow the project's AGENTS.md guidelines for development practices

Good luck! Remember to update Linear frequently so we can track your progress.
