import * as z from "zod";
import { ErrorResponse } from "./errorresponse.js";
export type DeleteExternalAgentRequest = {
    tenantId: string;
    projectId: string;
    id: string;
};
export declare const DeleteExternalAgentRequest$zodSchema: z.ZodType<DeleteExternalAgentRequest, z.ZodTypeDef, unknown>;
export type DeleteExternalAgentResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    ErrorResponse?: ErrorResponse | undefined;
};
export declare const DeleteExternalAgentResponse$zodSchema: z.ZodType<DeleteExternalAgentResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=deleteexternalagentop.d.ts.map