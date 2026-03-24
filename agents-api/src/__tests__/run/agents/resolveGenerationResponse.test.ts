import { describe, expect, it } from 'vitest';
import { resolveGenerationResponse } from '../../../domains/run/agents/Agent';

/**
 * The AI SDK's `DefaultGenerateTextResult` and `DefaultStreamTextResult` classes
 * expose key properties (`text`, `steps`, `finishReason`, `output`) as prototype
 * getters — NOT as own enumerable properties. The JavaScript spread operator
 * (`{ ...obj }`) only copies own enumerable properties, silently dropping prototype
 * getters. This caused a production bug where `response.text` became `undefined`
 * after spreading, leading to empty response artifacts and infinite retry loops
 * in the execution handler.
 *
 * `resolveGenerationResponse` fixes this by explicitly resolving all needed getters
 * (which may return Promises for StreamTextResult) before spreading them as own
 * properties on the resulting plain object.
 */
describe('resolveGenerationResponse', () => {
  describe('with generateText-style response (prototype getters returning direct values)', () => {
    class MockGenerateTextResult {
      private _steps: Array<{ text: string; toolCalls: any[] }>;
      private _output: any;
      totalUsage: { promptTokens: number; completionTokens: number };

      constructor() {
        this._steps = [
          { text: 'Step 1 text', toolCalls: [] },
          { text: 'Final step text', toolCalls: [] },
        ];
        this._output = undefined;
        this.totalUsage = { promptTokens: 100, completionTokens: 50 };
      }

      get steps() {
        return this._steps;
      }

      get finalStep() {
        return this._steps[this._steps.length - 1];
      }

      get text() {
        return this.finalStep.text;
      }

      get finishReason() {
        return 'stop' as const;
      }

      get output() {
        return this._output;
      }
    }

    it('should demonstrate that spreading loses prototype getters', () => {
      const result = new MockGenerateTextResult();

      expect(result.text).toBe('Final step text');
      expect(result.finishReason).toBe('stop');

      const spread: Record<string, unknown> = { ...result };

      expect(spread.text).toBeUndefined();
      expect(spread.finishReason).toBeUndefined();
      expect(spread.steps).toBeUndefined();
    });

    it('should preserve text after resolution', async () => {
      const result = new MockGenerateTextResult();
      const resolved = await resolveGenerationResponse(result as any);

      expect(resolved.text).toBe('Final step text');
    });

    it('should preserve finishReason after resolution', async () => {
      const result = new MockGenerateTextResult();
      const resolved = await resolveGenerationResponse(result as any);

      expect(resolved.finishReason).toBe('stop');
    });

    it('should preserve steps after resolution', async () => {
      const result = new MockGenerateTextResult();
      const resolved = await resolveGenerationResponse(result as any);

      expect(resolved.steps).toHaveLength(2);
      expect(resolved.steps[1].text).toBe('Final step text');
    });

    it('should produce a plain object safe for further spreading', async () => {
      const result = new MockGenerateTextResult();
      const resolved = await resolveGenerationResponse(result as any);

      const reSpread = { ...resolved, extraProp: true };

      expect(reSpread.text).toBe('Final step text');
      expect(reSpread.finishReason).toBe('stop');
      expect(reSpread.steps).toHaveLength(2);
      expect(reSpread.extraProp).toBe(true);
    });

    it('should preserve own properties like totalUsage', async () => {
      const result = new MockGenerateTextResult();
      const resolved = await resolveGenerationResponse(result as any);

      expect((resolved as any).totalUsage).toEqual({
        promptTokens: 100,
        completionTokens: 50,
      });
    });
  });

  describe('with streamText-style response (prototype getters returning Promises)', () => {
    class MockStreamTextResult {
      private _steps: Promise<Array<{ text: string; toolCalls: any[] }>>;

      constructor() {
        this._steps = Promise.resolve([
          { text: 'Streamed step 1', toolCalls: [] },
          { text: 'Streamed final', toolCalls: [] },
        ]);
      }

      get steps() {
        return this._steps;
      }

      get finalStep() {
        return this._steps.then((steps) => steps[steps.length - 1]);
      }

      get text() {
        return this.finalStep.then((step) => step.text);
      }

      get finishReason() {
        return this.finalStep.then(() => 'stop' as const);
      }

      get output() {
        return this.finalStep.then(() => undefined);
      }
    }

    it('should demonstrate that spreading loses Promise-based getters', () => {
      const result = new MockStreamTextResult();

      expect(result.text).toBeInstanceOf(Promise);

      const spread: Record<string, unknown> = { ...result };

      expect(spread.text).toBeUndefined();
      expect(spread.finishReason).toBeUndefined();
      expect(spread.steps).toBeUndefined();
    });

    it('should resolve Promise-based text', async () => {
      const result = new MockStreamTextResult();
      const resolved = await resolveGenerationResponse(result as any);

      expect(resolved.text).toBe('Streamed final');
    });

    it('should resolve Promise-based finishReason', async () => {
      const result = new MockStreamTextResult();
      const resolved = await resolveGenerationResponse(result as any);

      expect(resolved.finishReason).toBe('stop');
    });

    it('should resolve Promise-based steps', async () => {
      const result = new MockStreamTextResult();
      const resolved = await resolveGenerationResponse(result as any);

      expect(resolved.steps).toHaveLength(2);
      expect(resolved.steps[1].text).toBe('Streamed final');
    });

    it('should produce a plain object safe for further spreading', async () => {
      const result = new MockStreamTextResult();
      const resolved = await resolveGenerationResponse(result as any);

      const reSpread = { ...resolved, formattedContent: { parts: [] } };

      expect(reSpread.text).toBe('Streamed final');
      expect(reSpread.finishReason).toBe('stop');
      expect(reSpread.steps).toHaveLength(2);
      expect(reSpread.formattedContent).toEqual({ parts: [] });
    });
  });

  describe('with formattedContent (streaming with collected parts)', () => {
    class MockStreamResultWithFormattedContent {
      private _steps: Promise<Array<{ text: string; toolCalls: any[] }>>;
      formattedContent: { parts: Array<{ kind: string; text?: string }> };

      constructor() {
        this._steps = Promise.resolve([{ text: 'Text with artifacts', toolCalls: [] }]);
        this.formattedContent = {
          parts: [{ kind: 'text', text: 'Parsed text content' }],
        };
      }

      get steps() {
        return this._steps;
      }

      get text() {
        return this._steps.then((steps) => steps[steps.length - 1].text);
      }

      get finishReason() {
        return Promise.resolve('stop' as const);
      }

      get output() {
        return Promise.resolve(undefined);
      }
    }

    it('should preserve formattedContent as own property through resolution', async () => {
      const result = new MockStreamResultWithFormattedContent();
      const resolved = await resolveGenerationResponse(result as any);

      expect(resolved.formattedContent).toEqual({
        parts: [{ kind: 'text', text: 'Parsed text content' }],
      });
    });

    it('should preserve formattedContent through a second spread', async () => {
      const result = new MockStreamResultWithFormattedContent();
      const resolved = await resolveGenerationResponse(result as any);

      const reSpread = { ...resolved, extra: true };

      expect(reSpread.formattedContent).toEqual({
        parts: [{ kind: 'text', text: 'Parsed text content' }],
      });
      expect(reSpread.text).toBe('Text with artifacts');
    });
  });

  describe('edge cases', () => {
    it('should handle response without steps (passthrough)', async () => {
      const plainResponse = { someField: 'value' };
      const resolved = await resolveGenerationResponse(plainResponse as any);

      expect(resolved).toBe(plainResponse);
    });

    it('should handle structured output in output field', async () => {
      class MockWithOutput {
        private _steps = [{ text: '', toolCalls: [] }];

        get steps() {
          return this._steps;
        }

        get text() {
          return '';
        }

        get finishReason() {
          return 'stop' as const;
        }

        get output() {
          return {
            dataComponents: [{ id: 'comp-1', name: 'FAQ', props: { title: 'Test' } }],
          };
        }
      }

      const result = new MockWithOutput();
      const resolved = await resolveGenerationResponse(result as any);

      expect(resolved.output).toEqual({
        dataComponents: [{ id: 'comp-1', name: 'FAQ', props: { title: 'Test' } }],
      });

      expect(resolved.output?.dataComponents).toHaveLength(1);
    });

    it('should throw a descriptive error when a getter rejects', async () => {
      class MockRejectingGetter {
        get steps() {
          return Promise.reject(new Error('Stream terminated unexpectedly'));
        }

        get text() {
          return Promise.resolve('some text');
        }

        get finishReason() {
          return Promise.resolve('stop' as const);
        }

        get output() {
          return Promise.resolve(undefined);
        }
      }

      const result = new MockRejectingGetter();
      await expect(resolveGenerationResponse(result as any)).rejects.toThrow(
        'Failed to resolve generation response: Stream terminated unexpectedly'
      );
    });

    it('should not lose text when it is an empty string', async () => {
      class MockEmptyText {
        private _steps = [{ text: '', toolCalls: [{ toolName: 'lookup' }] }];

        get steps() {
          return this._steps;
        }

        get text() {
          return '';
        }

        get finishReason() {
          return 'tool-calls' as const;
        }

        get output() {
          return undefined;
        }
      }

      const result = new MockEmptyText();
      const resolved = await resolveGenerationResponse(result as any);

      expect(resolved.text).toBe('');
      expect(typeof resolved.text).toBe('string');
    });
  });
});
