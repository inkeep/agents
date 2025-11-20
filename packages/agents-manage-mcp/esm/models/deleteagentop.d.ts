import * as z from "zod";
import { ErrorResponse } from "./errorresponse.js";
export type DeleteAgentRequest = {
    tenantId: string;
    projectId: string;
    id: string;
};
export declare const DeleteAgentRequest$zodSchema: z.ZodType<DeleteAgentRequest, z.ZodTypeDef, unknown>;
export type DeleteAgentResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    ErrorResponse?: ErrorResponse | undefined;
};
export declare const DeleteAgentResponse$zodSchema: z.ZodType<DeleteAgentResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=deleteagentop.d.ts.map