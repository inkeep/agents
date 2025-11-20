import * as z from "zod";
import { Agent } from "./agent.js";
import { Pagination } from "./pagination.js";
export type AgentListResponse = {
    data: Array<Agent>;
    pagination: Pagination;
};
export declare const AgentListResponse$zodSchema: z.ZodType<AgentListResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=agentlistresponse.d.ts.map