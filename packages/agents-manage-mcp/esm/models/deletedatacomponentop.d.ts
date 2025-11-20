import * as z from "zod";
import { ErrorResponse } from "./errorresponse.js";
export type DeleteDataComponentRequest = {
    tenantId: string;
    projectId: string;
    id: string;
};
export declare const DeleteDataComponentRequest$zodSchema: z.ZodType<DeleteDataComponentRequest, z.ZodTypeDef, unknown>;
export type DeleteDataComponentResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    ErrorResponse?: ErrorResponse | undefined;
};
export declare const DeleteDataComponentResponse$zodSchema: z.ZodType<DeleteDataComponentResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=deletedatacomponentop.d.ts.map