import * as z from "zod";
import { Pagination } from "./pagination.js";
import { SubAgent } from "./subagent.js";
export type SubAgentListResponse = {
    data: Array<SubAgent>;
    pagination: Pagination;
};
export declare const SubAgentListResponse$zodSchema: z.ZodType<SubAgentListResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=subagentlistresponse.d.ts.map