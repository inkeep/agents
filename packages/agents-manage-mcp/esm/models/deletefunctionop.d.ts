import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type DeleteFunctionRequest = {
    tenantId: string;
    projectId: string;
    id: string;
};
export declare const DeleteFunctionRequest$zodSchema: z.ZodType<DeleteFunctionRequest, z.ZodTypeDef, unknown>;
export type DeleteFunctionResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const DeleteFunctionResponse$zodSchema: z.ZodType<DeleteFunctionResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=deletefunctionop.d.ts.map