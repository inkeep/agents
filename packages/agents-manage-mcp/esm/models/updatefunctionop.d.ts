import * as z from 'zod';
import { type BadRequest } from './badrequest.js';
import { type Forbidden } from './forbidden.js';
import { type FunctionResponse } from './functionresponse.js';
import { type FunctionUpdate } from './functionupdate.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type UpdateFunctionRequest = {
    tenantId: string;
    projectId: string;
    id: string;
    body?: FunctionUpdate | undefined;
};
export declare const UpdateFunctionRequest$zodSchema: z.ZodType<UpdateFunctionRequest, z.ZodTypeDef, unknown>;
export type UpdateFunctionResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    FunctionResponse?: FunctionResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const UpdateFunctionResponse$zodSchema: z.ZodType<UpdateFunctionResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=updatefunctionop.d.ts.map