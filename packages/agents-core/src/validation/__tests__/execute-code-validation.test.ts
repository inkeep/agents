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
    it('anonymous function', () => {
      expect(() => test('function() {}')).not.toThrowError();
    });

    it('async anonymous function', () => {
      expect(() => test('async function() {}')).not.toThrowError();
    });

    it('arrow function', () => {
      expect(() => test('() => 1')).not.toThrowError();
    });

    it('async arrow function', () => {
      expect(() => test('async () => 1')).not.toThrowError();
    });

    it('named function', () => {
      expect(() => test('function foo() {}')).not.toThrowError();
    });

    it('async named function', () => {
      expect(() => test('async function foo() {}')).not.toThrowError();
    });
  });
});
