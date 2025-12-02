import * as z from 'zod';
import { type BadRequest } from './badrequest.js';
import { type ContextConfigListResponse } from './contextconfiglistresponse.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type ListContextConfigsRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    page?: number | undefined;
    limit?: number | undefined;
};
export declare const ListContextConfigsRequest$zodSchema: z.ZodType<ListContextConfigsRequest, z.ZodTypeDef, unknown>;
export type ListContextConfigsResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    ContextConfigListResponse?: ContextConfigListResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const ListContextConfigsResponse$zodSchema: z.ZodType<ListContextConfigsResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=listcontextconfigsop.d.ts.map