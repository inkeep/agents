import * as z from "zod";
import { McpTool } from "./mcptool.js";
import { Pagination } from "./pagination.js";
export type McpToolListResponse = {
    data: Array<McpTool>;
    pagination: Pagination;
};
export declare const McpToolListResponse$zodSchema: z.ZodType<McpToolListResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=mcptoollistresponse.d.ts.map