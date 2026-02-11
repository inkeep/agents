export class SpiceDbError extends Error {
  public readonly grpcCode?: number;
  public readonly originalError: unknown;

  constructor(message: string, opts?: { cause?: unknown; grpcCode?: number }) {
    super(message, { cause: opts?.cause });
    this.name = 'SpiceDbError';
    this.grpcCode = opts?.grpcCode;
    this.originalError = opts?.cause;
  }
}
