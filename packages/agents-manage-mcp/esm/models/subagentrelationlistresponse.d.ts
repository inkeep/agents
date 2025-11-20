import * as z from "zod";
import { Pagination } from "./pagination.js";
import { SubAgentRelation } from "./subagentrelation.js";
export type SubAgentRelationListResponse = {
    data: Array<SubAgentRelation>;
    pagination: Pagination;
};
export declare const SubAgentRelationListResponse$zodSchema: z.ZodType<SubAgentRelationListResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=subagentrelationlistresponse.d.ts.map