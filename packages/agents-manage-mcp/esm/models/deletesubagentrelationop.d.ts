import * as z from "zod";
import { ErrorResponse } from "./errorresponse.js";
export type DeleteSubAgentRelationRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    id: string;
};
export declare const DeleteSubAgentRelationRequest$zodSchema: z.ZodType<DeleteSubAgentRelationRequest, z.ZodTypeDef, unknown>;
export type DeleteSubAgentRelationResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    ErrorResponse?: ErrorResponse | undefined;
};
export declare const DeleteSubAgentRelationResponse$zodSchema: z.ZodType<DeleteSubAgentRelationResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=deletesubagentrelationop.d.ts.map