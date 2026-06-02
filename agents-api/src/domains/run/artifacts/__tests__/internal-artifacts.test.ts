import { describe, expect, it } from 'vitest';
import {
  INTERNAL_TOOL_RESULT_ARTIFACT_TYPE,
  isInternalToolResultArtifactData,
} from '../internal-artifacts';

describe('isInternalToolResultArtifactData', () => {
  it('matches tool_result artifact data', () => {
    expect(
      isInternalToolResultArtifactData({
        artifactId: 'compress_x',
        toolCallId: 'c',
        type: 'tool_result',
      })
    ).toBe(true);
  });

  it('does not match user-authored artifact types', () => {
    expect(
      isInternalToolResultArtifactData({ artifactId: 'a', toolCallId: 'c', type: 'code' })
    ).toBe(false);
    expect(isInternalToolResultArtifactData({ type: 'document' })).toBe(false);
    expect(isInternalToolResultArtifactData({ component: 'chart' })).toBe(false);
  });

  it('does not match non-object / nullish payloads', () => {
    expect(isInternalToolResultArtifactData(undefined)).toBe(false);
    expect(isInternalToolResultArtifactData(null)).toBe(false);
    expect(isInternalToolResultArtifactData('tool_result')).toBe(false);
    expect(isInternalToolResultArtifactData({})).toBe(false);
  });

  it('exposes the reserved internal artifact type', () => {
    expect(INTERNAL_TOOL_RESULT_ARTIFACT_TYPE).toBe('tool_result');
  });
});
