import * as z from "zod";
import { FunctionT } from "./function.js";
import { Pagination } from "./pagination.js";
export type FunctionListResponse = {
    data: Array<FunctionT>;
    pagination: Pagination;
};
export declare const FunctionListResponse$zodSchema: z.ZodType<FunctionListResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=functionlistresponse.d.ts.map