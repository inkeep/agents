import * as z from 'zod';
import { type Pagination } from './pagination.js';
import { type SubAgentTeamAgentRelation } from './subagentteamagentrelation.js';
export type SubAgentTeamAgentRelationListResponse = {
    data: Array<SubAgentTeamAgentRelation>;
    pagination: Pagination;
};
export declare const SubAgentTeamAgentRelationListResponse$zodSchema: z.ZodType<SubAgentTeamAgentRelationListResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=subagentteamagentrelationlistresponse.d.ts.map