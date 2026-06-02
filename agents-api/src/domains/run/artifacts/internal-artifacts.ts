/**
 * Internal-artifact visibility predicate shared by the end-user read surfaces.
 *
 * The runtime auto-compresses oversized tool results into `tool_result`
 * artifacts so the model can still reference them by `toolCallId`. Those
 * artifacts are model-facing plumbing — they must reach the model (history,
 * `available_artifacts`, A2A delegation) but must NOT surface to end users as
 * citation/"References" cards.
 *
 * Suppression happens at the human READ boundary (never at the saved-message
 * write — the ledger message is the shared source for both model history and
 * human reads). The signal is the artifact's `type`: `tool_result` is set only
 * by the compression/tool-result internals (`BaseCompressor`, tool-wrapper),
 * whereas user-authored `artifact:create` artifacts take their type from the
 * component name — so there is no collision with legitimate user artifacts.
 *
 * The builder/admin manage console intentionally KEEPS these (it renders via a
 * separate `formatMessagesForLLMContext` path that never calls these surfaces).
 *
 * See specs/2026-05-30-internal-compressed-artifact-suppression/SPEC.md (D1–D3).
 */
export const INTERNAL_TOOL_RESULT_ARTIFACT_TYPE = 'tool_result';

/**
 * True when an artifact data-part payload is an internal `tool_result`
 * artifact that should be stripped from end-user read surfaces.
 */
export function isInternalToolResultArtifactData(data: unknown): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: unknown }).type === INTERNAL_TOOL_RESULT_ARTIFACT_TYPE
  );
}
