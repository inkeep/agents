import * as z from 'zod';
import { type BadRequest } from './badrequest.js';
import { type ErrorResponse } from './errorresponse.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
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