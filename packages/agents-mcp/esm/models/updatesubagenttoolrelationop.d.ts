import * as z from 'zod';
import { type BadRequest } from './badrequest.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type SubAgentToolRelationResponse } from './subagenttoolrelationresponse.js';
import { type SubAgentToolRelationUpdate } from './subagenttoolrelationupdate.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type UpdateSubagentToolRelationRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    id: string;
    body?: SubAgentToolRelationUpdate | undefined;
};
export declare const UpdateSubagentToolRelationRequest$zodSchema: z.ZodType<UpdateSubagentToolRelationRequest, z.ZodTypeDef, unknown>;
export type UpdateSubagentToolRelationResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    SubAgentToolRelationResponse?: SubAgentToolRelationResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const UpdateSubagentToolRelationResponse$zodSchema: z.ZodType<UpdateSubagentToolRelationResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=updatesubagenttoolrelationop.d.ts.map