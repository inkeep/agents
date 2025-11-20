import * as z from "zod";
import { ErrorResponse } from "./errorresponse.js";
export type DeleteCredentialRequest = {
    tenantId: string;
    projectId: string;
    id: string;
};
export declare const DeleteCredentialRequest$zodSchema: z.ZodType<DeleteCredentialRequest, z.ZodTypeDef, unknown>;
export type DeleteCredentialResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    ErrorResponse?: ErrorResponse | undefined;
};
export declare const DeleteCredentialResponse$zodSchema: z.ZodType<DeleteCredentialResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=deletecredentialop.d.ts.map