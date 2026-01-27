/**
 * Signature validation utilities for webhook authentication.
 * Re-exports JMESPath and regex validation from jmespath-utils for backward compatibility.
 */

export type { ValidationResult } from './jmespath-utils';
export { validateJMESPath, validateRegex } from './jmespath-utils';
