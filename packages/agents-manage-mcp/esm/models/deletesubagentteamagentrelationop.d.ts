import * as z from "zod";
import { ErrorResponse } from "./errorresponse.js";
export type DeleteSubAgentTeamAgentRelationRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    subAgentId: string;
    id: string;
};
export declare const DeleteSubAgentTeamAgentRelationRequest$zodSchema: z.ZodType<DeleteSubAgentTeamAgentRelationRequest, z.ZodTypeDef, unknown>;
export type DeleteSubAgentTeamAgentRelationResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    ErrorResponse?: ErrorResponse | undefined;
};
export declare const DeleteSubAgentTeamAgentRelationResponse$zodSchema: z.ZodType<DeleteSubAgentTeamAgentRelationResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=deletesubagentteamagentrelationop.d.ts.map