import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { ErrorResponse } from "./errorresponse.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { ProjectCreate } from "./projectcreate.js";
import { ProjectResponse } from "./projectresponse.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type CreateProjectRequest = {
    tenantId: string;
    body?: ProjectCreate | undefined;
};
export declare const CreateProjectRequest$zodSchema: z.ZodType<CreateProjectRequest, z.ZodTypeDef, unknown>;
export type CreateProjectResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    ProjectResponse?: ProjectResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    ErrorResponse?: ErrorResponse | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const CreateProjectResponse$zodSchema: z.ZodType<CreateProjectResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=createprojectop.d.ts.map