---
"@inkeep/agents-core": patch
---

Add channel-based agent authorization for Slack with configurable `grantAccessToMembers` toggle

- Extend `SlackAccessTokenPayloadSchema` with `authorized`, `authSource`, `channelId`, `authorizedProjectId` claims
- Add `grantAccessToMembers` column to `work_app_slack_channel_agent_configs` table (default `true`)
- Extend `BaseExecutionContext` with `metadata.slack` for channel auth context
- Add `resolveEffectiveAgent` with `grantAccessToMembers` propagation from channel/workspace config
