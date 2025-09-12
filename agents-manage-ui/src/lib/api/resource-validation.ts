/**
 * Resource ID validation utility
 *
 * Provides centralized validation for all resource IDs (tenant, project, etc.)
 * Follows the same pattern as backend resourceIdSchema validation
 */

export class ResourceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResourceValidationError';
  }
}

export interface ResourceValidationOptions {
  /** Display name for error messages (e.g., "Tenant ID", "Project ID") */
  resourceName: string;
  /** Minimum allowed length (default: 1) */
  minLength?: number;
  /** Maximum allowed length (default: 255) */
  maxLength?: number;
  /** Custom regex pattern (default: URL-safe pattern) */
  pattern?: RegExp;
}

/**
 * Generic resource ID validation function
 */
export function validateResourceId(id: string, options: ResourceValidationOptions): void {
  const { resourceName, minLength = 1, maxLength = 255, pattern = /^[a-zA-Z0-9_-]+$/ } = options;

  if (!id) {
    throw new ResourceValidationError(`${resourceName} is required`);
  }

  if (typeof id !== 'string') {
    throw new ResourceValidationError(`${resourceName} must be a string`);
  }

  if (id.trim() !== id) {
    throw new ResourceValidationError(`${resourceName} cannot have leading/trailing whitespace`);
  }

  if (!pattern.test(id)) {
    throw new ResourceValidationError(
      `${resourceName} contains invalid characters. Only alphanumeric, underscore, and dash allowed`
    );
  }

  if (id.length < minLength || id.length > maxLength) {
    throw new ResourceValidationError(
      `${resourceName} must be between ${minLength} and ${maxLength} characters`
    );
  }
}

/**
 * Safe validation that returns boolean instead of throwing
 */
export function isValidResourceId(id: string, options: ResourceValidationOptions): boolean {
  try {
    validateResourceId(id, options);
    return true;
  } catch {
    return false;
  }
}

// Convenience functions for common resource types

/**
 * Validates tenant ID with specific constraints
 */
export function validateTenantId(tenantId: string): void {
  validateResourceId(tenantId, {
    resourceName: 'Tenant ID',
    maxLength: 50, // Tenant IDs have a shorter max length
  });
}

/**
 * Validates project ID with specific constraints
 */
export function validateProjectId(projectId: string): void {
  validateResourceId(projectId, {
    resourceName: 'Project ID',
    maxLength: 255, // Projects can have longer IDs
  });
}

/**
 * Safe tenant ID validation
 */
export function isValidTenantId(tenantId: string): boolean {
  return isValidResourceId(tenantId, {
    resourceName: 'Tenant ID',
    maxLength: 50,
  });
}

/**
 * Safe project ID validation
 */
export function isValidProjectId(projectId: string): boolean {
  return isValidResourceId(projectId, {
    resourceName: 'Project ID',
    maxLength: 255,
  });
}
