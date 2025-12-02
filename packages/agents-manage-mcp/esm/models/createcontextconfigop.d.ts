import * as z from 'zod';
import { type BadRequest } from './badrequest.js';
import { type ContextConfigCreate } from './contextconfigcreate.js';
import { type ContextConfigResponse } from './contextconfigresponse.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type CreateContextConfigRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    body?: ContextConfigCreate | undefined;
};
export declare const CreateContextConfigRequest$zodSchema: z.ZodType<CreateContextConfigRequest, z.ZodTypeDef, unknown>;
export type CreateContextConfigResponse = {
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
export declare const CreateContextConfigResponse$zodSchema: z.ZodType<CreateContextConfigResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=createcontextconfigop.d.ts.map