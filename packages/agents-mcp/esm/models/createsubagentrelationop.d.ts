import * as z from 'zod';
import { type BadRequest } from './badrequest.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type SubAgentRelationCreate } from './subagentrelationcreate.js';
import { type SubAgentRelationResponse } from './subagentrelationresponse.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type CreateSubAgentRelationRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    body?: SubAgentRelationCreate | undefined;
};
export declare const CreateSubAgentRelationRequest$zodSchema: z.ZodType<CreateSubAgentRelationRequest, z.ZodTypeDef, unknown>;
export type CreateSubAgentRelationResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    SubAgentRelationResponse?: SubAgentRelationResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const CreateSubAgentRelationResponse$zodSchema: z.ZodType<CreateSubAgentRelationResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=createsubagentrelationop.d.ts.map