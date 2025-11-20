import * as z from 'zod';
import { type BadRequest } from './badrequest.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type SubAgentExternalAgentRelationCreate } from './subagentexternalagentrelationcreate.js';
import { type SubAgentExternalAgentRelationResponse } from './subagentexternalagentrelationresponse.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type CreateSubAgentExternalAgentRelationRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    subAgentId: string;
    body?: SubAgentExternalAgentRelationCreate | undefined;
};
export declare const CreateSubAgentExternalAgentRelationRequest$zodSchema: z.ZodType<CreateSubAgentExternalAgentRelationRequest, z.ZodTypeDef, unknown>;
export type CreateSubAgentExternalAgentRelationResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    SubAgentExternalAgentRelationResponse?: SubAgentExternalAgentRelationResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const CreateSubAgentExternalAgentRelationResponse$zodSchema: z.ZodType<CreateSubAgentExternalAgentRelationResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=createsubagentexternalagentrelationop.d.ts.map