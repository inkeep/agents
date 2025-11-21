/model composer-1

# Create PR with Changeset

## Overview
Create a pull request with proper changeset notes, ensuring version management and change documentation are in place before opening the PR.

## Steps

### 1. Verify and Create Changeset Notes
- Check if changeset files exist in the `.changeset/` directory
- If changeset notes exist, verify they accurately describe the current changes
- If no changeset exists or updates are needed:
  - Use `pnpm changeset:quick <major|minor|patch> "<changelog message>"` to create changeset
  - Choose appropriate semver level:
    - **patch**: Bug fixes and additive new features (most common)
    - **minor**: Schema changes requiring database migration or significant behavior changes
    - **major**: DO NOT USE (reserved for special future release)
  - Ensure the changelog message clearly describes what changed and why

### 2. Stage and Commit Changes
- Stage all changes including the changeset files
- Create a descriptive commit message that summarizes the work
- Commit the changes to the current branch

### 3. Create Pull Request
- Open a PR with `chat-to-edit` as the base branch
- Write a comprehensive PR description including:
  - **Summary**: High-level overview of what was accomplished
  - **Changes**: Detailed list of modifications made
  - **Context**: Why these changes were needed
  - **Testing**: How the changes were tested
  - **Breaking changes**: Any breaking changes (if applicable)

## PR Description Template

```markdown
## Summary
[Provide a clear, concise summary of the work that was completed]

## Changes
- [List key changes made]
- [Include both code and configuration changes]
- [Mention any new features or bug fixes]

## Context
[Explain why these changes were needed and any relevant background]

## Testing
- [ ] Unit tests added/updated
- [ ] Manual testing completed
- [ ] All tests passing

## Changeset
- [ ] Changeset notes created and committed
- [ ] Appropriate semver level selected
- [ ] Changelog message is clear and descriptive
```

## Checklist
- [ ] Changeset file created with `pnpm changeset:quick`
- [ ] Changeset message accurately describes changes
- [ ] All changes committed (including changeset files)
- [ ] PR opened with `chat-to-edit` as base branch
- [ ] PR description includes comprehensive summary
- [ ] Tests are passing

