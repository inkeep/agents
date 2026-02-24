import { FullAgentUpdateSchema } from './validation';

describe('FullAgentUpdateSchema', () => {
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
    };
  }

  it('should disallow null as input for json editors', () => {
    const result = FullAgentUpdateSchema.safeParse(createSchema('null'));
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
    const result = FullAgentUpdateSchema.safeParse(createSchema(''));
    expect(result.error).toBeUndefined();
  });

  it('should be able remove fields', () => {
    const result = FullAgentUpdateSchema.safeParse({
      id: '_',
      name: '_',
      statusUpdates: {},
      contextConfig: {
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
    });
    expect(result.success).toBe(true);
    if (result.data) {
      expect(result.data.stopWhen?.transferCountIs).toBe(undefined);
      expect(result.data.contextConfig.contextVariables).toBe(null);
      expect(result.data.contextConfig.headersSchema).toBe(null);
      expect(result.data.models.base.providerOptions).toBe(null);
      expect(result.data.models.structuredOutput.providerOptions).toBe(null);
      expect(result.data.models.summarizer.providerOptions).toBe(null);
    }
  });
});
