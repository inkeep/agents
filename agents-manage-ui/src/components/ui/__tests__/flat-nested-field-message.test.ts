import { describe } from 'vitest';
import { flatNestedFieldMessage } from '@/components/ui/form';
import type { FieldErrors } from 'react-hook-form';

describe('flatNestedFieldMessage', () => {
  it('should flat nested field', () => {
    const data: FieldErrors = {
      contextConfig: {
        contextVariables: {
          message: 'Invalid JSON syntax',
          type: 'custom',
          ref: {
            name: 'contextConfig.contextVariables',
          },
        },
        headersSchema: {
          message: 'Invalid JSON syntax',
          type: 'custom',
          ref: {
            name: 'contextConfig.headersSchema',
          },
        },
      },
    };
    expect(flatNestedFieldMessage(data)).toBe(`Invalid JSON syntax
  → at ["contextConfig", "contextVariables"]
Invalid JSON syntax
  → at ["contextConfig", "headersSchema"]`);
  });
});
