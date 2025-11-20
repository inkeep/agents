import * as z from "zod";
import { ErrorResponse } from "./errorresponse.js";
export type DeleteSubAgentExternalAgentRelationRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    subAgentId: string;
    id: string;
};
export declare const DeleteSubAgentExternalAgentRelationRequest$zodSchema: z.ZodType<DeleteSubAgentExternalAgentRelationRequest, z.ZodTypeDef, unknown>;
export type DeleteSubAgentExternalAgentRelationResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    ErrorResponse?: ErrorResponse | undefined;
};
export declare const DeleteSubAgentExternalAgentRelationResponse$zodSchema: z.ZodType<DeleteSubAgentExternalAgentRelationResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=deletesubagentexternalagentrelationop.d.ts.map