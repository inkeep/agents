import * as z from "zod";
import { FunctionTool } from "./functiontool.js";
import { Pagination } from "./pagination.js";
export type FunctionToolListResponse = {
    data: Array<FunctionTool>;
    pagination: Pagination;
};
export declare const FunctionToolListResponse$zodSchema: z.ZodType<FunctionToolListResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=functiontoollistresponse.d.ts.map