import { describe, expect, it } from 'vitest';
import { toolPoliciesNeedApproval, toolPolicyNeedsApprovalForTool } from '../tool-policies';

describe('toolPoliciesNeedApproval', () => {
  it('returns false for undefined/null/empty', () => {
    expect(toolPoliciesNeedApproval(undefined)).toBe(false);
    expect(toolPoliciesNeedApproval(null)).toBe(false);
    expect(toolPoliciesNeedApproval({})).toBe(false);
  });

  it('returns true if any policy needs approval', () => {
    expect(toolPoliciesNeedApproval({ '*': { needsApproval: true } })).toBe(true);
    expect(
      toolPoliciesNeedApproval({
        toolA: { needsApproval: false },
        toolB: { needsApproval: true },
      })
    ).toBe(true);
  });

  it('returns false if no policy needs approval', () => {
    expect(
      toolPoliciesNeedApproval({
        toolA: { needsApproval: false },
        toolB: {},
      })
    ).toBe(false);
  });
});

describe('toolPolicyNeedsApprovalForTool', () => {
  it('returns false for undefined/null/empty', () => {
    expect(toolPolicyNeedsApprovalForTool(undefined, 'toolA')).toBe(false);
    expect(toolPolicyNeedsApprovalForTool(null, 'toolA')).toBe(false);
    expect(toolPolicyNeedsApprovalForTool({}, 'toolA')).toBe(false);
  });

  it('returns true for wildcard approval', () => {
    expect(toolPolicyNeedsApprovalForTool({ '*': { needsApproval: true } }, 'toolA')).toBe(true);
  });

  it('returns true only for the matching tool name', () => {
    expect(
      toolPolicyNeedsApprovalForTool(
        {
          toolA: { needsApproval: true },
          toolB: { needsApproval: false },
        },
        'toolA'
      )
    ).toBe(true);
    expect(
      toolPolicyNeedsApprovalForTool(
        {
          toolA: { needsApproval: true },
          toolB: { needsApproval: false },
        },
        'toolB'
      )
    ).toBe(false);
  });
});

