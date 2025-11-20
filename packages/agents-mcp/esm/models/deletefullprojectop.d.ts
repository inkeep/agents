import * as z from 'zod';
import { type BadRequest } from './badrequest.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
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