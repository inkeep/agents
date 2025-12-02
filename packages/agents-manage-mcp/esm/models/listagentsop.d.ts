import * as z from 'zod';
import { type AgentListResponse } from './agentlistresponse.js';
import { type BadRequest } from './badrequest.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type ListAgentsRequest = {
    tenantId: string;
    projectId: string;
    page?: number | undefined;
    limit?: number | undefined;
};
export declare const ListAgentsRequest$zodSchema: z.ZodType<ListAgentsRequest, z.ZodTypeDef, unknown>;
export type ListAgentsResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    AgentListResponse?: AgentListResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const ListAgentsResponse$zodSchema: z.ZodType<ListAgentsResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=listagentsop.d.ts.map