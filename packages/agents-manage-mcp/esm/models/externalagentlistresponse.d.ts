import * as z from "zod";
import { ExternalAgent } from "./externalagent.js";
import { Pagination } from "./pagination.js";
export type ExternalAgentListResponse = {
    data: Array<ExternalAgent>;
    pagination: Pagination;
};
export declare const ExternalAgentListResponse$zodSchema: z.ZodType<ExternalAgentListResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=externalagentlistresponse.d.ts.map