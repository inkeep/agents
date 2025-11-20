import * as z from "zod";
import { ErrorResponse } from "./errorresponse.js";
export type DeleteSubagentRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    id: string;
};
export declare const DeleteSubagentRequest$zodSchema: z.ZodType<DeleteSubagentRequest, z.ZodTypeDef, unknown>;
export type DeleteSubagentResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    ErrorResponse?: ErrorResponse | undefined;
};
export declare const DeleteSubagentResponse$zodSchema: z.ZodType<DeleteSubagentResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=deletesubagentop.d.ts.map