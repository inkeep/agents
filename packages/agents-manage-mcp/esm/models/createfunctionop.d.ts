import * as z from 'zod';
import { type BadRequest } from './badrequest.js';
import { type Forbidden } from './forbidden.js';
import { type FunctionCreate } from './functioncreate.js';
import { type FunctionResponse } from './functionresponse.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type CreateFunctionRequest = {
    tenantId: string;
    projectId: string;
    body?: FunctionCreate | undefined;
};
export declare const CreateFunctionRequest$zodSchema: z.ZodType<CreateFunctionRequest, z.ZodTypeDef, unknown>;
export type CreateFunctionResponse = {
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
export declare const CreateFunctionResponse$zodSchema: z.ZodType<CreateFunctionResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=createfunctionop.d.ts.map