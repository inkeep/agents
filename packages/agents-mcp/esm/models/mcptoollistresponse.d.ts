import * as z from 'zod';
import { type McpTool } from './mcptool.js';
import { type Pagination } from './pagination.js';
export type McpToolListResponse = {
    data: Array<McpTool>;
    pagination: Pagination;
};
export declare const McpToolListResponse$zodSchema: z.ZodType<McpToolListResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=mcptoollistresponse.d.ts.map