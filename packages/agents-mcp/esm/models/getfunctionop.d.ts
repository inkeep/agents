import * as z from 'zod';
import { type BadRequest } from './badrequest.js';
import { type Forbidden } from './forbidden.js';
import { type FunctionResponse } from './functionresponse.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type GetFunctionRequest = {
    tenantId: string;
    projectId: string;
    id: string;
};
export declare const GetFunctionRequest$zodSchema: z.ZodType<GetFunctionRequest, z.ZodTypeDef, unknown>;
export type GetFunctionResponse = {
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
export declare const GetFunctionResponse$zodSchema: z.ZodType<GetFunctionResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=getfunctionop.d.ts.map