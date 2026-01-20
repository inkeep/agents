import type { conversations } from '@inkeep/agents-core';

export async function evaluationRunConfigMatchesConversation(
  _runConfig: any,
  _conversation: typeof conversations.$inferSelect
): Promise<boolean> {
  // For now, all active run configs match all conversations
  // This can be extended in the future to add filtering logic
  // based on agent IDs, conversation metadata, etc.
  return true;
}
