import * as z from "zod";
import { Pagination } from "./pagination.js";
import { SubAgentExternalAgentRelation } from "./subagentexternalagentrelation.js";
export type SubAgentExternalAgentRelationListResponse = {
    data: Array<SubAgentExternalAgentRelation>;
    pagination: Pagination;
};
export declare const SubAgentExternalAgentRelationListResponse$zodSchema: z.ZodType<SubAgentExternalAgentRelationListResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=subagentexternalagentrelationlistresponse.d.ts.map