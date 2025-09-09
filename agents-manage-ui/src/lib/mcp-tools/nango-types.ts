// Error classes for better error handling
export class NangoError extends Error {
	constructor(
		message: string,
		public readonly operation?: string,
		public readonly cause?: unknown,
	) {
		super(message);
		this.name = "NangoError";
	}
}

// Helper to wrap errors, preserving existing NangoErrors
export function wrapNangoError(
	error: unknown,
	message: string,
	operation?: string,
): never {
	if (error instanceof NangoError) {
		throw error;
	}
	throw new NangoError(message, operation, error);
}
