import * as z from 'zod';
import { type Pagination } from './pagination.js';
import { type RelatedAgentInfo } from './relatedagentinfo.js';
export type RelatedAgentInfoListResponse = {
    data: Array<RelatedAgentInfo>;
    pagination: Pagination;
};
export declare const RelatedAgentInfoListResponse$zodSchema: z.ZodType<RelatedAgentInfoListResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=relatedagentinfolistresponse.d.ts.map