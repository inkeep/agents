import * as z from 'zod';
import { type BadRequest } from './badrequest.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type SubAgentToolRelationResponse } from './subagenttoolrelationresponse.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type GetSubagentToolRelationRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    id: string;
};
export declare const GetSubagentToolRelationRequest$zodSchema: z.ZodType<GetSubagentToolRelationRequest, z.ZodTypeDef, unknown>;
export type GetSubagentToolRelationResponse = {
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
export declare const GetSubagentToolRelationResponse$zodSchema: z.ZodType<GetSubagentToolRelationResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=getsubagenttoolrelationop.d.ts.map