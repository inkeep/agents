import * as z from "zod";
export type Pagination = {
    page?: number | undefined;
    limit?: number | undefined;
    total: number;
    pages: number;
};
export declare const Pagination$zodSchema: z.ZodType<Pagination, z.ZodTypeDef, unknown>;
//# sourceMappingURL=pagination.d.ts.map