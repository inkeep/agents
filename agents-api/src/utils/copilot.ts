import { env } from '../env';

/**
 * Whether the copilot bypass is fully configured (all three env vars set).
 * Evaluated once at module load — safe because env vars don't change at runtime.
 */
export const copilotBypassConfigured =
  !!env.INKEEP_COPILOT_TENANT_ID &&
  !!env.INKEEP_COPILOT_PROJECT_ID &&
  !!env.INKEEP_COPILOT_AGENT_ID;

/**
 * Returns true when the given identifiers match the copilot agent configured
 * via INKEEP_COPILOT_* env vars. Used to bypass tenant membership and SpiceDB
 * permission checks for the copilot (chat-to-edit) feature.
 *
 * Callers should still verify the user is session-authenticated.
 * Target-resource authorization is enforced by the copilot agent via
 * forwarded session cookies.
 */
export function isCopilotAgent(ids: {
  tenantId: string;
  projectId?: string;
  agentId?: string;
}): boolean {
  if (!copilotBypassConfigured) return false;

  if (ids.tenantId !== env.INKEEP_COPILOT_TENANT_ID) return false;
  if (ids.projectId !== undefined && ids.projectId !== env.INKEEP_COPILOT_PROJECT_ID) return false;
  if (ids.agentId !== undefined && ids.agentId !== env.INKEEP_COPILOT_AGENT_ID) return false;

  return true;
}
