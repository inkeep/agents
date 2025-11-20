import * as z from "zod";
import { ErrorResponse } from "./errorresponse.js";
export type DeleteArtifactComponentRequest = {
    tenantId: string;
    projectId: string;
    id: string;
};
export declare const DeleteArtifactComponentRequest$zodSchema: z.ZodType<DeleteArtifactComponentRequest, z.ZodTypeDef, unknown>;
export type DeleteArtifactComponentResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    ErrorResponse?: ErrorResponse | undefined;
};
export declare const DeleteArtifactComponentResponse$zodSchema: z.ZodType<DeleteArtifactComponentResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=deleteartifactcomponentop.d.ts.map