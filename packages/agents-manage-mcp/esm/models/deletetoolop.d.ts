import * as z from "zod";
import { ErrorResponse } from "./errorresponse.js";
export type DeleteToolRequest = {
    tenantId: string;
    projectId: string;
    id: string;
};
export declare const DeleteToolRequest$zodSchema: z.ZodType<DeleteToolRequest, z.ZodTypeDef, unknown>;
export type DeleteToolResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    ErrorResponse?: ErrorResponse | undefined;
};
export declare const DeleteToolResponse$zodSchema: z.ZodType<DeleteToolResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=deletetoolop.d.ts.map