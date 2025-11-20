import * as z from 'zod';
import { type ContextConfig } from './contextconfig.js';
import { type Pagination } from './pagination.js';
export type ContextConfigListResponse = {
    data: Array<ContextConfig>;
    pagination: Pagination;
};
export declare const ContextConfigListResponse$zodSchema: z.ZodType<ContextConfigListResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=contextconfiglistresponse.d.ts.map