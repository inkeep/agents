import * as z from 'zod';
import { type BadRequest } from './badrequest.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
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