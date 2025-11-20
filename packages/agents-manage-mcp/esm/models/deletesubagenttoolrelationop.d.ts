import * as z from "zod";
import { ErrorResponse } from "./errorresponse.js";
export type DeleteSubagentToolRelationRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    id: string;
};
export declare const DeleteSubagentToolRelationRequest$zodSchema: z.ZodType<DeleteSubagentToolRelationRequest, z.ZodTypeDef, unknown>;
export type DeleteSubagentToolRelationResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    ErrorResponse?: ErrorResponse | undefined;
};
export declare const DeleteSubagentToolRelationResponse$zodSchema: z.ZodType<DeleteSubagentToolRelationResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=deletesubagenttoolrelationop.d.ts.map