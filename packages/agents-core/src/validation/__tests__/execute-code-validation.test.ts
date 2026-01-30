import { FunctionApiInsertSchema } from '../schemas';

function parse(executeCode: string) {
  return FunctionApiInsertSchema.parse({
    id: 'fn-1',
    executeCode,
  });
}

describe('FunctionApiInsertSchema executeCode validation', () => {
  describe('rejects', () => {
    test('export default declaration', () => {
      expect(() => parse('export default null')).toThrowError(
        /Export default declarations are not supported\. Provide a single function instead\./
      );
    });
    test('export declaration', () => {
      expect(() => parse('export let foo')).toThrowError(
        /Export declarations are not supported\. Provide a single function instead\./
      );
      expect(() => parse('export function foo() {}')).toThrowError(
        /Export declarations are not supported\. Provide a single function instead\./
      );
    });

    test('global return', () => {
      expect(() => parse('return 1')).toThrowError(/Top-level return is not allowed\./);
    });

    test('TypeScript syntax', () => {
      expect(() => parse('(value: number) => value')).toThrowError(
        /TypeScript syntax is not supported\./
      );
    });

    test('JSX syntax', () => {
      expect(() => parse('() => <div />')).toThrowError(/JSX syntax is not supported\./);
    });

    test('code without functions', () => {
      expect(() => parse('"test"')).toThrowError(/Must contain exactly one function\./);
    });

    test('code with 2 and more functions', () => {
      expect(() => parse('function foo() {} function bar() {}')).toThrowError(
        /Must contain exactly one function \(found 2\)\./
      );
    });
  });

  describe('allows', () => {
    test('anonymous function', () => {
      expect(() => parse('function() {}')).not.toThrowError();
    });

    test('async anonymous function', () => {
      expect(() => parse('async function() {}')).not.toThrowError();
    });

    test('arrow function', () => {
      expect(() => parse('() => 1')).not.toThrowError();
    });

    test('async arrow function', () => {
      expect(() => parse('async () => 1')).not.toThrowError();
    });

    test('named function', () => {
      expect(() => parse('function foo() {}')).not.toThrowError();
    });

    test('async named function', () => {
      expect(() => parse('async function foo() {}')).not.toThrowError();
    });
  });
});
