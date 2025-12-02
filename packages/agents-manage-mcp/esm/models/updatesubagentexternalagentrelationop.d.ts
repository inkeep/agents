import * as z from 'zod';
import { type BadRequest } from './badrequest.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type SubAgentExternalAgentRelationResponse } from './subagentexternalagentrelationresponse.js';
import { type SubAgentExternalAgentRelationUpdate } from './subagentexternalagentrelationupdate.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type UpdateSubAgentExternalAgentRelationRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    subAgentId: string;
    id: string;
    body?: SubAgentExternalAgentRelationUpdate | undefined;
};
export declare const UpdateSubAgentExternalAgentRelationRequest$zodSchema: z.ZodType<UpdateSubAgentExternalAgentRelationRequest, z.ZodTypeDef, unknown>;
export type UpdateSubAgentExternalAgentRelationResponse = {
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
export declare const UpdateSubAgentExternalAgentRelationResponse$zodSchema: z.ZodType<UpdateSubAgentExternalAgentRelationResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=updatesubagentexternalagentrelationop.d.ts.map