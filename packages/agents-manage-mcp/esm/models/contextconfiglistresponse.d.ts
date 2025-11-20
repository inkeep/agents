import * as z from "zod";
import { ContextConfig } from "./contextconfig.js";
import { Pagination } from "./pagination.js";
export type ContextConfigListResponse = {
    data: Array<ContextConfig>;
    pagination: Pagination;
};
export declare const ContextConfigListResponse$zodSchema: z.ZodType<ContextConfigListResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=contextconfiglistresponse.d.ts.map