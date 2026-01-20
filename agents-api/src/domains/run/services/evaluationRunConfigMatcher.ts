export async function evaluationRunConfigMatchesConversation(): Promise<boolean> {
  // For now, all active run configs match all conversations
  // This can be extended in the future to add filtering logic
  // based on agent IDs, conversation metadata, etc.
  return true;
}
