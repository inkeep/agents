import * as z from 'zod';
import { type BadRequest } from './badrequest.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type SubAgentRelationResponse } from './subagentrelationresponse.js';
import { type SubAgentRelationUpdate } from './subagentrelationupdate.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type UpdateSubAgentRelationRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    id: string;
    body?: SubAgentRelationUpdate | undefined;
};
export declare const UpdateSubAgentRelationRequest$zodSchema: z.ZodType<UpdateSubAgentRelationRequest, z.ZodTypeDef, unknown>;
export type UpdateSubAgentRelationResponse = {
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
export declare const UpdateSubAgentRelationResponse$zodSchema: z.ZodType<UpdateSubAgentRelationResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=updatesubagentrelationop.d.ts.map