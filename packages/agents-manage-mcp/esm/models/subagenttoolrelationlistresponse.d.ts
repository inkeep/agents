import * as z from "zod";
import { Pagination } from "./pagination.js";
import { SubAgentToolRelation } from "./subagenttoolrelation.js";
export type SubAgentToolRelationListResponse = {
    data: Array<SubAgentToolRelation>;
    pagination: Pagination;
};
export declare const SubAgentToolRelationListResponse$zodSchema: z.ZodType<SubAgentToolRelationListResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=subagenttoolrelationlistresponse.d.ts.map