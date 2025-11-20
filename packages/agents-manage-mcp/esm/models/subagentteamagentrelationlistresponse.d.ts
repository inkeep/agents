import * as z from "zod";
import { Pagination } from "./pagination.js";
import { SubAgentTeamAgentRelation } from "./subagentteamagentrelation.js";
export type SubAgentTeamAgentRelationListResponse = {
    data: Array<SubAgentTeamAgentRelation>;
    pagination: Pagination;
};
export declare const SubAgentTeamAgentRelationListResponse$zodSchema: z.ZodType<SubAgentTeamAgentRelationListResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=subagentteamagentrelationlistresponse.d.ts.map