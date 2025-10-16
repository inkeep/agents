/**
 * Domain-specific error classes
 *
 * These errors represent business logic failures and are independent
 * of presentation or infrastructure concerns.
 */

/**
 * Base class for all domain errors
 */
export abstract class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error thrown when a project cannot be found
 */
export class ProjectNotFoundError extends DomainError {
  constructor(
    public readonly projectPath: string,
    public readonly reason: string = 'index.ts not found'
  ) {
    super(`Project not found at ${projectPath}: ${reason}`, 'PROJECT_NOT_FOUND');
  }
}

/**
 * Error thrown when a project export is invalid
 */
export class InvalidProjectError extends DomainError {
  constructor(
    public readonly projectPath: string,
    reason: string = 'No valid project export found'
  ) {
    super(`Invalid project at ${projectPath}: ${reason}`, 'INVALID_PROJECT');
  }
}

/**
 * Error thrown when environment credentials cannot be loaded
 */
export class CredentialsLoadError extends DomainError {
  constructor(
    public readonly environment: string,
    reason: string
  ) {
    super(`Failed to load credentials for environment '${environment}': ${reason}`, 'CREDENTIALS_LOAD_ERROR');
  }
}

/**
 * Error thrown when project initialization fails
 */
export class ProjectInitializationError extends DomainError {
  constructor(
    public readonly projectId: string,
    reason: string
  ) {
    super(`Failed to initialize project '${projectId}': ${reason}`, 'PROJECT_INITIALIZATION_ERROR');
  }
}

/**
 * Error thrown when agent operations fail
 */
export class AgentOperationError extends DomainError {
  constructor(
    public readonly operation: string,
    reason: string
  ) {
    super(`Agent operation '${operation}' failed: ${reason}`, 'AGENT_OPERATION_ERROR');
  }
}
