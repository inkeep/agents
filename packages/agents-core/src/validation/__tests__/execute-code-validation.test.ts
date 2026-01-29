import { FunctionApiInsertSchema } from '../schemas';

function test(executeCode: string) {
  return FunctionApiInsertSchema.parse({
    id: 'fn-1',
    executeCode,
  });
}

describe('FunctionApiInsertSchema executeCode validation', () => {
  describe('rejects', () => {
    it('export default function', () => {
      expect(() => test('export default function() {}')).toThrowError(
        /Export default is not allowed/
      );
    });

    it('global return', () => {
      expect(() => test('return 1')).toThrowError(/Global return is not allowed/);
    });

    it('TypeScript syntax', () => {
      expect(() => test('(value: number) => value')).toThrowError(
        /TypeScript syntax is not allowed/
      );
    });

    it('JSX syntax', () => {
      expect(() => test('() => <div />')).toThrowError(/JSX syntax is not allowed/);
    });

    it('code without functions', () => {
      expect(() => test('"test"')).toThrowError(/Must have one function/);
    });

    it('code with 2 and more functions', () => {
      expect(() => test('function foo() {} function bar() {}')).toThrowError(
        /Must have one function, but got 2/
      );
    });
  });

  describe('allows', () => {
    it.skip('anonymous function', () => {
      expect(() => test('function() {}')).not.toThrowError();
    });

    it.skip('async anonymous function', () => {
      expect(() => test('async function() {}')).not.toThrowError();
    });

    it('arrow function', () => {
      const result = FunctionApiInsertSchema.safeParse({
        ...basePayload,
        executeCode: '() => 1',
      });
      expect(result.success).toBe(true);
    });

    it('async arrow function', () => {
      const result = FunctionApiInsertSchema.safeParse({
        ...basePayload,
        executeCode: 'async () => 1',
      });
      expect(result.success).toBe(true);
    });

    it('named function', () => {
      const result = FunctionApiInsertSchema.safeParse({
        ...basePayload,
        executeCode: 'function foo() {}',
      });
      expect(result.success).toBe(true);
    });

    it('async named function', () => {
      const result = FunctionApiInsertSchema.safeParse({
        ...basePayload,
        executeCode: 'async function foo() {}',
      });
      expect(result.success).toBe(true);
    });
  });
});
