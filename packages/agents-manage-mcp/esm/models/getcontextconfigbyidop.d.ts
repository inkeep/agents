import * as z from 'zod';
import { type BadRequest } from './badrequest.js';
import { type ContextConfigResponse } from './contextconfigresponse.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type GetContextConfigByIdRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    id: string;
};
export declare const GetContextConfigByIdRequest$zodSchema: z.ZodType<GetContextConfigByIdRequest, z.ZodTypeDef, unknown>;
export type GetContextConfigByIdResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    ContextConfigResponse?: ContextConfigResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const GetContextConfigByIdResponse$zodSchema: z.ZodType<GetContextConfigByIdResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=getcontextconfigbyidop.d.ts.map