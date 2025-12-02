import * as z from 'zod';
import { type BadRequest } from './badrequest.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type ProjectResponse } from './projectresponse.js';
import { type ProjectUpdate } from './projectupdate.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type UpdateProjectRequest = {
    tenantId: string;
    id: string;
    body?: ProjectUpdate | undefined;
};
export declare const UpdateProjectRequest$zodSchema: z.ZodType<UpdateProjectRequest, z.ZodTypeDef, unknown>;
export type UpdateProjectResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    ProjectResponse?: ProjectResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const UpdateProjectResponse$zodSchema: z.ZodType<UpdateProjectResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=updateprojectop.d.ts.map