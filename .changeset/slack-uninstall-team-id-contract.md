---
'@inkeep/agents-work-apps': patch
'@inkeep/agents-manage-ui': patch
---

Fix Slack workspace uninstall failing with "Slack workspace not found or not associated with a tenant"

The manage UI was passing the Nango `connectionId` (e.g. `E::T:T012AB3C4`) to `DELETE /work-apps/slack/workspaces/{teamId}`, but `requireWorkspaceAdmin` middleware uses that path parameter directly to look up the workspace by raw Slack team ID. The lookup never matched and uninstall failed with a 404.

The route now enforces a single contract: `:teamId` must be a raw Slack team ID (`T...`). A shared `SlackTeamIdSchema` Zod regex rejects connection IDs and other malformed values at the request boundary with 400 (instead of leaking into a confusing 404 from the middleware). The DELETE handler's dual `connectionId`-or-`teamId` parsing is removed, and the manage UI now sends `workspace.teamId` for uninstall.
