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
});
