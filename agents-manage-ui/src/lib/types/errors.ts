/**
 * Generic API error interface and class for handling API errors consistently across the application
 */

export interface ApiErrorData {
	code: string;
	message: string;
}

export class ApiError extends Error {
	constructor(
		public error: ApiErrorData,
		public status: number,
	) {
		super(error.message);
		this.name = "ApiError";
	}
}
