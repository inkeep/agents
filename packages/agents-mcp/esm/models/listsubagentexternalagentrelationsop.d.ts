import * as z from 'zod';
import { type BadRequest } from './badrequest.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type SubAgentExternalAgentRelationListResponse } from './subagentexternalagentrelationlistresponse.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type ListSubAgentExternalAgentRelationsRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    subAgentId: string;
    page?: number | undefined;
    limit?: number | undefined;
};
export declare const ListSubAgentExternalAgentRelationsRequest$zodSchema: z.ZodType<ListSubAgentExternalAgentRelationsRequest, z.ZodTypeDef, unknown>;
export type ListSubAgentExternalAgentRelationsResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    SubAgentExternalAgentRelationListResponse?: SubAgentExternalAgentRelationListResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const ListSubAgentExternalAgentRelationsResponse$zodSchema: z.ZodType<ListSubAgentExternalAgentRelationsResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=listsubagentexternalagentrelationsop.d.ts.map