import type { Span } from '@opentelemetry/api';
import { describe, expect, it } from 'vitest';
import type {
  AgentRunContext,
  ResolvedGenerationResponse,
} from '../../../domains/run/agents/agent-types';
import {
  deriveContractEnforcement,
  enforceOutputContract,
  getContractViolation,
  isContractViolation,
  resolveContractToolChoice,
} from '../../../domains/run/agents/output-contract';
import { ContractViolationError } from '../../../domains/run/errors/contract-violation-error';

function makeCtx(params: {
  outputContract?: AgentRunContext['config']['outputContract'];
  resolvedAllowText: boolean;
  artifacts?: Record<string, { type: string }>;
}): AgentRunContext {
  return {
    config: {
      id: 'test-sub-agent',
      outputContract: params.outputContract,
      artifacts: params.artifacts,
    },
    resolvedAllowText: params.resolvedAllowText,
  } as unknown as AgentRunContext;
}

function makeResponse(params?: {
  dataComponents?: Array<{ name: string; props?: Record<string, unknown> }>;
  toolCalls?: Array<{ toolName: string }>;
  text?: string;
}): ResolvedGenerationResponse {
  return {
    output: params?.dataComponents ? { dataComponents: params.dataComponents } : undefined,
    steps: params?.toolCalls ? [{ toolCalls: params.toolCalls }] : [],
    text: params?.text ?? '',
  } as unknown as ResolvedGenerationResponse;
}

function makeSpan(): Span {
  return { setAttributes: () => {} } as unknown as Span;
}

const stubLogger = { warn: () => {} };

describe('isContractViolation', () => {
  it('returns false when no outputContract is set', () => {
    expect(
      isContractViolation({
        ctx: makeCtx({ resolvedAllowText: true }),
        response: makeResponse(),
        hasStructuredOutput: false,
      })
    ).toBe(false);
  });

  it('flags a violation when allowText is false and only free text is produced', () => {
    expect(
      isContractViolation({
        ctx: makeCtx({ outputContract: { allowText: false }, resolvedAllowText: false }),
        response: makeResponse(),
        hasStructuredOutput: true,
      })
    ).toBe(true);
  });

  it('passes when allowText is false and structured output is produced', () => {
    expect(
      isContractViolation({
        ctx: makeCtx({ outputContract: { allowText: false }, resolvedAllowText: false }),
        response: makeResponse({ dataComponents: [{ name: 'SearchResults' }] }),
        hasStructuredOutput: true,
      })
    ).toBe(false);
  });

  it('passes when allowText is false and a tool call is produced (transfer/delegate-only)', () => {
    expect(
      isContractViolation({
        ctx: makeCtx({ outputContract: { allowText: false }, resolvedAllowText: false }),
        response: makeResponse({ toolCalls: [{ toolName: 'transfer_to_responder' }] }),
        hasStructuredOutput: false,
      })
    ).toBe(false);
  });

  it('flags a violation when a transfer/delegate-only agent emits text instead of a tool call', () => {
    expect(
      isContractViolation({
        ctx: makeCtx({ outputContract: { allowText: false }, resolvedAllowText: false }),
        response: makeResponse(),
        hasStructuredOutput: false,
      })
    ).toBe(true);
  });

  it('flags a violation when requireComponent is absent from the response', () => {
    expect(
      isContractViolation({
        ctx: makeCtx({
          outputContract: { requireComponent: ['SearchResults'] },
          resolvedAllowText: true,
        }),
        response: makeResponse({ dataComponents: [{ name: 'Other' }] }),
        hasStructuredOutput: true,
      })
    ).toBe(true);
  });

  it('passes when requireComponent is present even though allowText is true', () => {
    expect(
      isContractViolation({
        ctx: makeCtx({
          outputContract: { requireComponent: ['SearchResults'] },
          resolvedAllowText: true,
        }),
        response: makeResponse({ dataComponents: [{ name: 'SearchResults' }] }),
        hasStructuredOutput: true,
      })
    ).toBe(false);
  });

  it('flags a violation when requireArtifact is absent from the response', () => {
    expect(
      isContractViolation({
        ctx: makeCtx({
          outputContract: { requireArtifact: ['ResearchReport'] },
          resolvedAllowText: true,
        }),
        response: makeResponse({ dataComponents: [{ name: 'Other' }] }),
        hasStructuredOutput: true,
      })
    ).toBe(true);
  });

  it('passes when requireArtifact is present as an ArtifactCreate_ data component', () => {
    expect(
      isContractViolation({
        ctx: makeCtx({
          outputContract: { requireArtifact: ['ResearchReport'] },
          resolvedAllowText: true,
        }),
        response: makeResponse({ dataComponents: [{ name: 'ArtifactCreate_ResearchReport' }] }),
        hasStructuredOutput: true,
      })
    ).toBe(false);
  });

  it('flags a violation when requireTransfer is true but no transfer occurred', () => {
    expect(
      isContractViolation({
        ctx: makeCtx({
          outputContract: { requireTransfer: true },
          resolvedAllowText: true,
        }),
        response: makeResponse({ toolCalls: [{ toolName: 'some_tool' }] }),
        hasStructuredOutput: false,
      })
    ).toBe(true);
  });

  it('passes when requireTransfer is true and any transfer occurred', () => {
    expect(
      isContractViolation({
        ctx: makeCtx({
          outputContract: { requireTransfer: true },
          resolvedAllowText: true,
        }),
        response: makeResponse({ toolCalls: [{ toolName: 'transfer_to_responder' }] }),
        hasStructuredOutput: false,
      })
    ).toBe(false);
  });

  it('flags a violation when only some require-all components are present (D-I)', () => {
    expect(
      isContractViolation({
        ctx: makeCtx({
          outputContract: { requireComponent: ['SearchResults', 'Citations'] },
          resolvedAllowText: true,
        }),
        response: makeResponse({ dataComponents: [{ name: 'SearchResults' }] }),
        hasStructuredOutput: true,
      })
    ).toBe(true);
  });

  it('passes when every require-all component is present (D-I)', () => {
    expect(
      isContractViolation({
        ctx: makeCtx({
          outputContract: { requireComponent: ['SearchResults', 'Citations'] },
          resolvedAllowText: true,
        }),
        response: makeResponse({
          dataComponents: [{ name: 'SearchResults' }, { name: 'Citations' }],
        }),
        hasStructuredOutput: true,
      })
    ).toBe(false);
  });
});

describe('getContractViolation', () => {
  it('returns null when the contract is satisfied', () => {
    expect(
      getContractViolation({
        ctx: makeCtx({
          outputContract: { requireComponent: ['SearchResults'] },
          resolvedAllowText: true,
        }),
        response: makeResponse({ dataComponents: [{ name: 'SearchResults' }] }),
        hasStructuredOutput: true,
      })
    ).toBeNull();
  });

  it('names the missing required component and what was emitted', () => {
    const reason = getContractViolation({
      ctx: makeCtx({
        outputContract: { requireComponent: ['SearchResults'] },
        resolvedAllowText: true,
      }),
      response: makeResponse({ dataComponents: [{ name: 'Other' }] }),
      hasStructuredOutput: true,
    });
    expect(reason).toContain('requireComponent');
    expect(reason).toContain('SearchResults');
    expect(reason).toContain('Other');
  });

  it('explains a missing required transfer', () => {
    const reason = getContractViolation({
      ctx: makeCtx({ outputContract: { requireTransfer: true }, resolvedAllowText: true }),
      response: makeResponse({ toolCalls: [{ toolName: 'some_tool' }] }),
      hasStructuredOutput: false,
    });
    expect(reason).toContain('requireTransfer');
  });

  it('treats requireArtifact as satisfied by an <artifact:create> text marker', () => {
    expect(
      getContractViolation({
        ctx: makeCtx({
          outputContract: { requireArtifact: ['citation'] },
          resolvedAllowText: true,
        }),
        response: makeResponse({
          text: 'See <artifact:create id="a1" tool="t1" type="citation" base="x" /> here.',
        }),
        hasStructuredOutput: false,
      })
    ).toBeNull();
  });

  it('treats requireArtifact as satisfied by an <artifact:ref> to an existing artifact (D-K)', () => {
    expect(
      getContractViolation({
        ctx: makeCtx({
          outputContract: { requireArtifact: ['citation'] },
          resolvedAllowText: true,
          artifacts: { 'art-1': { type: 'citation' } },
        }),
        response: makeResponse({
          text: 'See <artifact:ref id="art-1" tool="t1" /> for the source.',
        }),
        hasStructuredOutput: false,
      })
    ).toBeNull();
  });

  it('treats requireArtifact as satisfied by a structured Artifact reference component (D-K)', () => {
    expect(
      getContractViolation({
        ctx: makeCtx({
          outputContract: { requireArtifact: ['citation'] },
          resolvedAllowText: true,
          artifacts: { 'art-1': { type: 'citation' } },
        }),
        response: makeResponse({
          dataComponents: [{ name: 'Artifact', props: { artifact_id: 'art-1' } }],
        }),
        hasStructuredOutput: true,
      })
    ).toBeNull();
  });

  it('still flags requireArtifact when a reference points at a different artifact type', () => {
    const reason = getContractViolation({
      ctx: makeCtx({
        outputContract: { requireArtifact: ['citation'] },
        resolvedAllowText: true,
        artifacts: { 'art-2': { type: 'diagram' } },
      }),
      response: makeResponse({ text: '<artifact:ref id="art-2" tool="t1" />' }),
      hasStructuredOutput: false,
    });
    expect(reason).toContain('requireArtifact');
    expect(reason).toContain('citation');
  });

  it('still flags requireArtifact when a ref points at an artifact id not in the registry', () => {
    const reason = getContractViolation({
      ctx: makeCtx({
        outputContract: { requireArtifact: ['citation'] },
        resolvedAllowText: true,
        artifacts: { 'art-1': { type: 'citation' } },
      }),
      response: makeResponse({ text: '<artifact:ref id="art-unknown" tool="t1" />' }),
      hasStructuredOutput: false,
    });
    expect(reason).toContain('requireArtifact');
    expect(reason).toContain('citation');
  });

  it('still flags requireArtifact when a structured Artifact has a non-string artifact_id', () => {
    const reason = getContractViolation({
      ctx: makeCtx({
        outputContract: { requireArtifact: ['citation'] },
        resolvedAllowText: true,
        artifacts: { 'art-1': { type: 'citation' } },
      }),
      response: makeResponse({
        dataComponents: [{ name: 'Artifact', props: { artifact_id: null } }],
      }),
      hasStructuredOutput: true,
    });
    expect(reason).toContain('requireArtifact');
    expect(reason).toContain('citation');
  });

  it('explains a free-text-only response when allowText is false', () => {
    const reason = getContractViolation({
      ctx: makeCtx({ outputContract: { allowText: false }, resolvedAllowText: false }),
      response: makeResponse({ text: 'just a sentence' }),
      hasStructuredOutput: false,
    });
    expect(reason).toContain('allowText');
  });

  it('lists the ArtifactCreate_ component (prefix stripped) in the requireArtifact diagnostic when the wrong type is produced', () => {
    const reason = getContractViolation({
      ctx: makeCtx({
        outputContract: { requireArtifact: ['invoice'] },
        resolvedAllowText: true,
        artifacts: {},
      }),
      response: makeResponse({
        dataComponents: [{ name: 'ArtifactCreate_receipt' }],
      }),
      hasStructuredOutput: true,
    });
    expect(reason).toContain('requireArtifact');
    expect(reason).toContain('invoice');
    // The produced artifact type (after stripping ArtifactCreate_) must appear in
    // the `present` list so the diagnostic is actionable.
    expect(reason).toContain('receipt');
  });
});

describe('deriveContractEnforcement', () => {
  it('false when no contract, no structured output, allowText resolved true', () => {
    expect(
      deriveContractEnforcement({
        outputContract: undefined,
        resolvedAllowText: true,
        hasStructuredOutput: false,
      })
    ).toBe(false);
  });

  it('true when hasStructuredOutput', () => {
    expect(
      deriveContractEnforcement({
        outputContract: undefined,
        resolvedAllowText: true,
        hasStructuredOutput: true,
      })
    ).toBe(true);
  });

  it('true when resolvedAllowText is false', () => {
    expect(
      deriveContractEnforcement({
        outputContract: { allowText: false },
        resolvedAllowText: false,
        hasStructuredOutput: false,
      })
    ).toBe(true);
  });

  it('true when requireArtifact is set', () => {
    expect(
      deriveContractEnforcement({
        outputContract: { requireArtifact: ['X'] },
        resolvedAllowText: true,
        hasStructuredOutput: false,
      })
    ).toBe(true);
  });

  it('true when requireTransfer is set', () => {
    expect(
      deriveContractEnforcement({
        outputContract: { requireTransfer: true },
        resolvedAllowText: true,
        hasStructuredOutput: false,
      })
    ).toBe(true);
  });

  it('true when requireComponent is set', () => {
    expect(
      deriveContractEnforcement({
        outputContract: { requireComponent: ['X'] },
        resolvedAllowText: true,
        hasStructuredOutput: false,
      })
    ).toBe(true);
  });
});

describe('resolveContractToolChoice', () => {
  it("'required' when allowText false and no data/artifact components", () => {
    expect(
      resolveContractToolChoice({
        resolvedAllowText: false,
        hasStructuredOutput: false,
        hasArtifactComponents: false,
      })
    ).toBe('required');
  });

  it("'auto' when the agent has structured output", () => {
    expect(
      resolveContractToolChoice({
        resolvedAllowText: false,
        hasStructuredOutput: true,
        hasArtifactComponents: false,
      })
    ).toBe('auto');
  });

  it("'auto' when allowText is true", () => {
    expect(
      resolveContractToolChoice({
        resolvedAllowText: true,
        hasStructuredOutput: false,
        hasArtifactComponents: false,
      })
    ).toBe('auto');
  });

  it("'auto' when the agent declares artifact components", () => {
    expect(
      resolveContractToolChoice({
        resolvedAllowText: false,
        hasStructuredOutput: false,
        hasArtifactComponents: true,
      })
    ).toBe('auto');
  });
});

describe('enforceOutputContract', () => {
  it('returns without effect when hasContractEnforcement is false', () => {
    expect(() =>
      enforceOutputContract({
        ctx: makeCtx({ resolvedAllowText: true }),
        response: makeResponse(),
        hasStructuredOutput: false,
        hasContractEnforcement: false,
        textResponse: '',
        span: makeSpan(),
        logger: stubLogger,
      })
    ).not.toThrow();
  });

  it('logs and does not throw under onViolation: warn', () => {
    let warned = false;
    enforceOutputContract({
      ctx: makeCtx({
        outputContract: { allowText: false, onViolation: 'warn' },
        resolvedAllowText: false,
      }),
      response: makeResponse(),
      hasStructuredOutput: false,
      hasContractEnforcement: true,
      textResponse: 'prose',
      span: makeSpan(),
      logger: {
        warn: () => {
          warned = true;
        },
      },
    });
    expect(warned).toBe(true);
  });

  it('throws ContractViolationError under onViolation: reject', () => {
    expect(() =>
      enforceOutputContract({
        ctx: makeCtx({
          outputContract: { allowText: false, onViolation: 'reject' },
          resolvedAllowText: false,
        }),
        response: makeResponse(),
        hasStructuredOutput: false,
        hasContractEnforcement: true,
        textResponse: 'prose',
        span: makeSpan(),
        logger: stubLogger,
      })
    ).toThrow(ContractViolationError);
  });

  it('throws under the default policy (onViolation undefined)', () => {
    expect(() =>
      enforceOutputContract({
        ctx: makeCtx({ outputContract: { allowText: false }, resolvedAllowText: false }),
        response: makeResponse(),
        hasStructuredOutput: false,
        hasContractEnforcement: true,
        textResponse: 'prose',
        span: makeSpan(),
        logger: stubLogger,
      })
    ).toThrow(ContractViolationError);
  });

  it('throws under explicit onViolation: "retry" (currently aliased to reject until D-H)', () => {
    expect(() =>
      enforceOutputContract({
        ctx: makeCtx({
          outputContract: { allowText: false, onViolation: 'retry' },
          resolvedAllowText: false,
        }),
        response: makeResponse(),
        hasStructuredOutput: false,
        hasContractEnforcement: true,
        textResponse: 'prose',
        span: makeSpan(),
        logger: stubLogger,
      })
    ).toThrow(ContractViolationError);
  });

  it('returns without throwing or warning when enforcement is on but the contract is satisfied', () => {
    let warned = false;
    expect(() =>
      enforceOutputContract({
        ctx: makeCtx({ outputContract: { allowText: false }, resolvedAllowText: false }),
        response: makeResponse({ dataComponents: [{ name: 'SearchResults' }] }),
        hasStructuredOutput: true,
        hasContractEnforcement: true,
        textResponse: '',
        span: makeSpan(),
        logger: {
          warn: () => {
            warned = true;
          },
        },
      })
    ).not.toThrow();
    expect(warned).toBe(false);
  });
});
