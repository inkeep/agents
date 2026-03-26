import { apiToFormValues, FullAgentFormSchema } from './validation';

describe('FullAgentFormSchema', () => {
  function createSchema(value: string) {
    return {
      id: 'test',
      name: 'test',
      contextConfig: {
        id: 'test',
        headersSchema: value,
        contextVariables: value,
      },
      statusUpdates: {
        statusComponents: value,
      },
      models: {
        base: {
          providerOptions: value,
        },
        structuredOutput: {
          providerOptions: value,
        },
        summarizer: {
          providerOptions: value,
        },
      },
      subAgents: {},
      externalAgents: {},
      teamAgents: {},
      tools: {},
    };
  }

  it('should disallow null as input for json editors', () => {
    const result = FullAgentFormSchema.safeParse(createSchema('null'));
    expect(result.success).toBe(false);
    expect(JSON.parse((result.error as any).message)).toStrictEqual([
      {
        code: 'custom',
        path: ['contextConfig', 'headersSchema'],
        message: 'Cannot be null',
      },
      {
        code: 'custom',
        path: ['contextConfig', 'contextVariables'],
        message: 'Cannot be null',
      },
      {
        code: 'custom',
        path: ['statusUpdates', 'statusComponents'],
        message: 'Cannot be null',
      },
      {
        code: 'custom',
        path: ['models', 'base', 'providerOptions'],
        message: 'Cannot be null',
      },
      {
        code: 'custom',
        path: ['models', 'structuredOutput', 'providerOptions'],
        message: 'Cannot be null',
      },
      {
        code: 'custom',
        path: ['models', 'summarizer', 'providerOptions'],
        message: 'Cannot be null',
      },
    ]);
  });

  it('should allow empty string', () => {
    const result = FullAgentFormSchema.safeParse(createSchema(''));
    expect(result.error).toBeUndefined();
  });

  it('should be able remove fields', () => {
    const result = FullAgentFormSchema.safeParse({
      id: '_',
      name: '_',
      statusUpdates: {},
      contextConfig: {
        id: '_',
        contextVariables: '',
        headersSchema: '',
      },
      stopWhen: {
        transferCountIs: null,
      },
      models: {
        base: {
          model: 'anthropic/claude-opus-4-6',
          providerOptions: '',
        },
        structuredOutput: {
          model: 'anthropic/claude-3-5-haiku-latest',
          providerOptions: '',
        },
        summarizer: {
          model: 'anthropic/claude-sonnet-4-0',
          providerOptions: '',
        },
      },
      subAgents: {},
      externalAgents: {},
      teamAgents: {},
      tools: {},
    });
    expect(result.success).toBe(true);
    if (result.data) {
      expect(result.data.stopWhen?.transferCountIs).toBe(undefined);
      expect(result.data.contextConfig.contextVariables).toBe(null);
      expect(result.data.contextConfig.headersSchema).toBe(null);
      expect(result.data.models.base.providerOptions).toBe(undefined);
      expect(result.data.models.structuredOutput.providerOptions).toBe(undefined);
      expect(result.data.models.summarizer.providerOptions).toBe(undefined);
    }
  });

  it('should keep defaultSubAgentNodeId in form values without transforming it to agent id', () => {
    const result = FullAgentFormSchema.safeParse({
      id: '_',
      name: '_',
      defaultSubAgentNodeId: 'temp-node-id',
      statusUpdates: {},
      contextConfig: {
        id: '_',
        contextVariables: '',
        headersSchema: '',
      },
      models: {
        base: {
          model: 'anthropic/claude-opus-4-6',
          providerOptions: '',
        },
        structuredOutput: {
          model: 'anthropic/claude-3-5-haiku-latest',
          providerOptions: '',
        },
        summarizer: {
          model: 'anthropic/claude-sonnet-4-0',
          providerOptions: '',
        },
      },
      subAgents: {
        'temp-node-id': {
          id: 'persisted-agent-id',
          name: 'Sub Agent',
          prompt: 'Hi',
          type: 'internal',
          models: {
            base: {
              model: '',
            },
            structuredOutput: {
              model: '',
            },
            summarizer: {
              model: '',
            },
          },
          canUse: [],
          dataComponents: [],
          artifactComponents: [],
          stopWhen: {},
        },
      },
      externalAgents: {},
      teamAgents: {},
      tools: {},
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.defaultSubAgentNodeId).toBe('temp-node-id');
    }
  });
});

describe('apiToFormValues', () => {
  it('rehydrates external agent headers from delegation relations when top-level external agent headers are missing', () => {
    const result = apiToFormValues({
      id: 'agent-1',
      name: 'Agent 1',
      description: '',
      prompt: '',
      defaultSubAgentId: 'sub-agent-1',
      contextConfig: null,
      statusUpdates: null,
      stopWhen: null,
      models: {},
      subAgents: {
        'sub-agent-1': {
          id: 'sub-agent-1',
          name: 'Sub agent 1',
          description: '',
          prompt: 'Handle requests',
          type: 'internal',
          dataComponents: [],
          artifactComponents: [],
          canUse: [],
          canTransferTo: [],
          canDelegateTo: [
            {
              externalAgentId: 'external-agent-1',
              headers: {
                Authorization: 'Bearer external-token',
              },
              subAgentExternalAgentRelationId: 'ext-rel-1',
            },
          ],
        },
      },
      functions: {},
      functionTools: {},
      externalAgents: {
        'external-agent-1': {
          id: 'external-agent-1',
          name: 'External Agent',
          description: '',
          baseUrl: 'https://example.com/agent',
          credentialReferenceId: null,
        },
      },
      teamAgents: {},
      tools: {},
    } as any);

    expect(JSON.parse(result.externalAgents['external-agent-1']?.headers ?? '{}')).toEqual({
      Authorization: 'Bearer external-token',
    });
  });

  it('rehydrates team agent headers from delegation relations when top-level team agent headers are missing', () => {
    const result = apiToFormValues({
      id: 'agent-1',
      name: 'Agent 1',
      description: '',
      prompt: '',
      defaultSubAgentId: 'sub-agent-1',
      contextConfig: null,
      statusUpdates: null,
      stopWhen: null,
      models: {},
      subAgents: {
        'sub-agent-1': {
          id: 'sub-agent-1',
          name: 'Sub agent 1',
          description: '',
          prompt: 'Handle requests',
          type: 'internal',
          dataComponents: [],
          artifactComponents: [],
          canUse: [],
          canTransferTo: [],
          canDelegateTo: [
            {
              agentId: 'team-agent-1',
              headers: {
                Authorization: 'Bearer team-token',
              },
              subAgentTeamAgentRelationId: 'team-rel-1',
            },
          ],
        },
      },
      functions: {},
      functionTools: {},
      externalAgents: {},
      teamAgents: {
        'team-agent-1': {
          id: 'team-agent-1',
          name: 'Team Agent',
          description: '',
        },
      },
      tools: {},
    } as any);

    expect(JSON.parse(result.teamAgents['team-agent-1']?.headers ?? '{}')).toEqual({
      Authorization: 'Bearer team-token',
    });
  });
});
