import * as z from 'zod';
import { type BadRequest } from './badrequest.js';
import { type ExternalAgentListResponse } from './externalagentlistresponse.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type ListExternalAgentsRequest = {
    tenantId: string;
    projectId: string;
    page?: number | undefined;
    limit?: number | undefined;
};
export declare const ListExternalAgentsRequest$zodSchema: z.ZodType<ListExternalAgentsRequest, z.ZodTypeDef, unknown>;
export type ListExternalAgentsResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    ExternalAgentListResponse?: ExternalAgentListResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const ListExternalAgentsResponse$zodSchema: z.ZodType<ListExternalAgentsResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=listexternalagentsop.d.ts.map