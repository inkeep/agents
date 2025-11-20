import * as z from "zod";
import { ErrorResponse } from "./errorresponse.js";
export type DeleteApiKeyRequest = {
    tenantId: string;
    projectId: string;
    id: string;
};
export declare const DeleteApiKeyRequest$zodSchema: z.ZodType<DeleteApiKeyRequest, z.ZodTypeDef, unknown>;
export type DeleteApiKeyResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    ErrorResponse?: ErrorResponse | undefined;
};
export declare const DeleteApiKeyResponse$zodSchema: z.ZodType<DeleteApiKeyResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=deleteapikeyop.d.ts.map