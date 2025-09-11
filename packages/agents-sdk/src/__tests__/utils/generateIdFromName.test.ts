import { describe, expect, it } from 'vitest';
import { generateIdFromName } from '../../utils/generateIdFromName';

describe('generateIdFromName', () => {
  it('should convert simple name to kebab-case', () => {
    expect(generateIdFromName('Simple Name')).toBe('simple-name');
  });

  it('should handle multiple spaces', () => {
    expect(generateIdFromName('Multiple    Spaces   Here')).toBe('multiple-spaces-here');
  });

  it('should handle special characters', () => {
    expect(generateIdFromName('Special!@#$%^&*()Characters')).toBe('special-characters');
  });

  it('should handle mixed case and special characters', () => {
    expect(generateIdFromName('Test Component With Spaces & Special!@# Characters')).toBe(
      'test-component-with-spaces-special-characters'
    );
  });

  it('should handle leading and trailing special characters', () => {
    expect(generateIdFromName('!!!Leading and Trailing!!!')).toBe('leading-and-trailing');
  });

  it('should handle numbers', () => {
    expect(generateIdFromName('Component123 Test456')).toBe('component123-test456');
  });

  it('should handle already kebab-case names', () => {
    expect(generateIdFromName('already-kebab-case')).toBe('already-kebab-case');
  });

  it('should handle empty string', () => {
    expect(generateIdFromName('')).toBe('');
  });

  it('should handle string with only special characters', () => {
    expect(generateIdFromName('!@#$%^&*()')).toBe('');
  });

  it('should handle underscores and hyphens', () => {
    expect(generateIdFromName('test_component-name')).toBe('test-component-name');
  });

  it('should handle camelCase', () => {
    expect(generateIdFromName('camelCaseComponentName')).toBe('camelcasecomponentname');
  });

  it('should handle PascalCase', () => {
    expect(generateIdFromName('PascalCaseComponentName')).toBe('pascalcasecomponentname');
  });
});
