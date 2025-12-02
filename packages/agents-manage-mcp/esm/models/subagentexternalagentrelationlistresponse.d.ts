import * as z from 'zod';
import { type Pagination } from './pagination.js';
import { type SubAgentExternalAgentRelation } from './subagentexternalagentrelation.js';
export type SubAgentExternalAgentRelationListResponse = {
    data: Array<SubAgentExternalAgentRelation>;
    pagination: Pagination;
};
export declare const SubAgentExternalAgentRelationListResponse$zodSchema: z.ZodType<SubAgentExternalAgentRelationListResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=subagentexternalagentrelationlistresponse.d.ts.map