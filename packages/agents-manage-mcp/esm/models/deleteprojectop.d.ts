import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { ErrorResponse } from "./errorresponse.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type DeleteProjectRequest = {
    tenantId: string;
    id: string;
};
export declare const DeleteProjectRequest$zodSchema: z.ZodType<DeleteProjectRequest, z.ZodTypeDef, unknown>;
export type DeleteProjectResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    ErrorResponse?: ErrorResponse | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const DeleteProjectResponse$zodSchema: z.ZodType<DeleteProjectResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=deleteprojectop.d.ts.map