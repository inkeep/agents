import * as z from 'zod';
import { type BadRequest } from './badrequest.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type SubAgentTeamAgentRelationListResponse } from './subagentteamagentrelationlistresponse.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type ListSubAgentTeamAgentRelationsRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    subAgentId: string;
    page?: number | undefined;
    limit?: number | undefined;
};
export declare const ListSubAgentTeamAgentRelationsRequest$zodSchema: z.ZodType<ListSubAgentTeamAgentRelationsRequest, z.ZodTypeDef, unknown>;
export type ListSubAgentTeamAgentRelationsResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    SubAgentTeamAgentRelationListResponse?: SubAgentTeamAgentRelationListResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const ListSubAgentTeamAgentRelationsResponse$zodSchema: z.ZodType<ListSubAgentTeamAgentRelationsResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=listsubagentteamagentrelationsop.d.ts.map