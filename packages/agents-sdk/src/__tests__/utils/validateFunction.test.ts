import { describe, expect, it } from 'vitest';
import { validateFunction } from '../../utils/validateFunction';

describe('validateFunction', () => {
  it('should not throw error for valid functions', () => {
    const testFunction = () => 'test';
    expect(() => validateFunction(testFunction, 'testFunction')).not.toThrow();
  });

  it('should not throw error for arrow functions', () => {
    const arrowFunction = (x: number) => x * 2;
    expect(() => validateFunction(arrowFunction, 'arrowFunction')).not.toThrow();
  });

  it('should not throw error for async functions', () => {
    const asyncFunction = async () => Promise.resolve('test');
    expect(() => validateFunction(asyncFunction, 'asyncFunction')).not.toThrow();
  });

  it('should not throw error for class constructors', () => {
    class TestClass {}
    expect(() => validateFunction(TestClass, 'TestClass')).not.toThrow();
  });

  it('should throw error for strings', () => {
    expect(() => validateFunction('not a function', 'stringValue')).toThrow(
      'stringValue must be a function'
    );
  });

  it('should throw error for numbers', () => {
    expect(() => validateFunction(42, 'numberValue')).toThrow('numberValue must be a function');
  });

  it('should throw error for objects', () => {
    expect(() => validateFunction({}, 'objectValue')).toThrow('objectValue must be a function');
  });

  it('should throw error for arrays', () => {
    expect(() => validateFunction([], 'arrayValue')).toThrow('arrayValue must be a function');
  });

  it('should throw error for null', () => {
    expect(() => validateFunction(null, 'nullValue')).toThrow('nullValue must be a function');
  });

  it('should throw error for undefined', () => {
    expect(() => validateFunction(undefined, 'undefinedValue')).toThrow(
      'undefinedValue must be a function'
    );
  });

  it('should throw error for boolean values', () => {
    expect(() => validateFunction(true, 'booleanValue')).toThrow('booleanValue must be a function');
    expect(() => validateFunction(false, 'booleanValue')).toThrow(
      'booleanValue must be a function'
    );
  });

  it('should use correct parameter name in error message', () => {
    expect(() => validateFunction('test', 'myCustomParameter')).toThrow(
      'myCustomParameter must be a function'
    );
  });
});
