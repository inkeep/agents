import * as z from 'zod';
import { type Pagination } from './pagination.js';
import { type SubAgentToolRelation } from './subagenttoolrelation.js';
export type SubAgentToolRelationListResponse = {
    data: Array<SubAgentToolRelation>;
    pagination: Pagination;
};
export declare const SubAgentToolRelationListResponse$zodSchema: z.ZodType<SubAgentToolRelationListResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=subagenttoolrelationlistresponse.d.ts.map