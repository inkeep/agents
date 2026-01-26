/**
 * Signature validation utilities for webhook authentication.
 * Re-exports JMESPath and regex validation from jmespath-utils for backward compatibility.
 */

export { validateJMESPath, validateRegex } from './jmespath-utils';
export type { ValidationResult } from './jmespath-utils';
