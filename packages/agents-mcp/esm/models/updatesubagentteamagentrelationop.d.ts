import * as z from 'zod';
import { type BadRequest } from './badrequest.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type SubAgentTeamAgentRelationResponse } from './subagentteamagentrelationresponse.js';
import { type SubAgentTeamAgentRelationUpdate } from './subagentteamagentrelationupdate.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type UpdateSubAgentTeamAgentRelationRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    subAgentId: string;
    id: string;
    body?: SubAgentTeamAgentRelationUpdate | undefined;
};
export declare const UpdateSubAgentTeamAgentRelationRequest$zodSchema: z.ZodType<UpdateSubAgentTeamAgentRelationRequest, z.ZodTypeDef, unknown>;
export type UpdateSubAgentTeamAgentRelationResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    SubAgentTeamAgentRelationResponse?: SubAgentTeamAgentRelationResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const UpdateSubAgentTeamAgentRelationResponse$zodSchema: z.ZodType<UpdateSubAgentTeamAgentRelationResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=updatesubagentteamagentrelationop.d.ts.map