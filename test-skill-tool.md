# Test: Claude Code Review Skill Tool Availability

This is a test PR to determine whether Claude Code Review (GitHub Actions) has access to the `Skill` tool.

## Questions for @claude

1. What tools do you have available? Please list them all.
2. Do you have a `Skill` tool?
3. Can you see skills defined in `.claude/skills/` or `.cursor/skills/`?
4. Try running `/write-docs` - does that work?
5. What does your context tell you about available skills?

## Expected Outcome

This will help us understand if we need to:
- Manually inject skill content into prompts (current approach)
- Enable the Skill tool via `--allowedTools`
- Or if skills work automatically

---
*This file can be deleted after the test.*
