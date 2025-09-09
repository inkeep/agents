export type SingleResponse<T> = {
	data: T;
};

export interface ListResponse<T> {
	data: T[];
	pagination: {
		page: number;
		pageSize: number;
		total: number;
		totalPages: number;
	};
}
