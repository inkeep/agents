import { FunctionApiInsertSchema } from '../schemas';

const basePayload = {
  id: 'fn-1',
};

describe('FunctionApiInsertSchema executeCode validation', () => {
  it('rejects export default function', () => {
    expect(() =>
      FunctionApiInsertSchema.parse({
        ...basePayload,
        executeCode: 'export default function() {}',
      })
    ).toThrowError(/Export default is not allowed/);
  });

  it('rejects global return', () => {
    expect(() =>
      FunctionApiInsertSchema.parse({
        ...basePayload,
        executeCode: 'return 1',
      })
    ).toThrowError(/Global return is not allowed/);
  });

  it('allows arrow functions', () => {
    const result = FunctionApiInsertSchema.safeParse({
      ...basePayload,
      executeCode: '() => 1',
    });
    expect(result.success).toBe(true);
  });

  it('rejects TypeScript syntax', () => {
    expect(() =>
      FunctionApiInsertSchema.parse({
        ...basePayload,
        executeCode: '(value: number) => value',
      })
    ).toThrowError(/TypeScript syntax is not allowed/);
  });

  // it('rejects JSX syntax', () => {
  //   const result = FunctionApiInsertSchema.safeParse({
  //     ...basePayload,
  //     executeCode: '() => <div />',
  //   });
  //   expect(result.success).toBe(false);
  // });

  // it('allows function bodies with return', () => {
  //   const result = FunctionApiInsertSchema.safeParse({
  //     ...basePayload,
  //     executeCode: 'return 1',
  //   });
  //   expect(result.success).toBe(true);
  // });
});
