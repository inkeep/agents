import * as z from 'zod';
import { type BadRequest } from './badrequest.js';
import { type ErrorResponse } from './errorresponse.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type ProjectCreate } from './projectcreate.js';
import { type ProjectResponse } from './projectresponse.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
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