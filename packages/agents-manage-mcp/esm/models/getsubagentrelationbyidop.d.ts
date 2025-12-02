import * as z from 'zod';
import { type BadRequest } from './badrequest.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type SubAgentRelationResponse } from './subagentrelationresponse.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type GetSubAgentRelationByIdRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    id: string;
};
export declare const GetSubAgentRelationByIdRequest$zodSchema: z.ZodType<GetSubAgentRelationByIdRequest, z.ZodTypeDef, unknown>;
export type GetSubAgentRelationByIdResponse = {
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
export declare const GetSubAgentRelationByIdResponse$zodSchema: z.ZodType<GetSubAgentRelationByIdResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=getsubagentrelationbyidop.d.ts.map