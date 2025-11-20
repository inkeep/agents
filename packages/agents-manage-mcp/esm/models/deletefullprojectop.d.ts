import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type DeleteFullProjectRequest = {
    tenantId: string;
    projectId: string;
};
export declare const DeleteFullProjectRequest$zodSchema: z.ZodType<DeleteFullProjectRequest, z.ZodTypeDef, unknown>;
export type DeleteFullProjectResponse = {
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
export declare const DeleteFullProjectResponse$zodSchema: z.ZodType<DeleteFullProjectResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=deletefullprojectop.d.ts.map