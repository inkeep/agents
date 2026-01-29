import { FunctionApiInsertSchema } from '../schemas';

const basePayload = {
  id: 'fn-1',
};

describe('FunctionApiInsertSchema executeCode validation', () => {
  describe('rejects', () => {
    it('export default function', () => {
      expect(() =>
        FunctionApiInsertSchema.parse({
          ...basePayload,
          executeCode: 'export default function() {}',
        })
      ).toThrowError(/Export default is not allowed/);
    });

    it('global return', () => {
      expect(() =>
        FunctionApiInsertSchema.parse({
          ...basePayload,
          executeCode: 'return 1',
        })
      ).toThrowError(/Global return is not allowed/);
    });

    it('TypeScript syntax', () => {
      expect(() =>
        FunctionApiInsertSchema.parse({
          ...basePayload,
          executeCode: '(value: number) => value',
        })
      ).toThrowError(/TypeScript syntax is not allowed/);
    });

    it('JSX syntax', () => {
      expect(() =>
        FunctionApiInsertSchema.parse({
          ...basePayload,
          executeCode: '() => <div />',
        })
      ).toThrowError(/JSX syntax is not allowed/);
    });

    it('code without functions', () => {
      expect(() =>
        FunctionApiInsertSchema.parse({
          ...basePayload,
          executeCode: '"test"',
        })
      ).toThrowError(/Must have one function/);
    });

    it('code with 2 and more functions', () => {
      expect(() =>
        FunctionApiInsertSchema.parse({
          ...basePayload,
          executeCode: 'function foo() {} function bar() {}',
        })
      ).toThrowError(/Must have one function, but got 2/);
    });
  });

  describe('allows', () => {
    it('arrow functions', () => {
      const result = FunctionApiInsertSchema.safeParse({
        ...basePayload,
        executeCode: '() => 1',
      });
      expect(result.success).toBe(true);
    });
  });
});
