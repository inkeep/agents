import * as z from 'zod';
import { type AgentResponse } from './agentresponse.js';
import { type AgentUpdate } from './agentupdate.js';
import { type BadRequest } from './badrequest.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type UpdateAgentRequest = {
    tenantId: string;
    projectId: string;
    id: string;
    body?: AgentUpdate | undefined;
};
export declare const UpdateAgentRequest$zodSchema: z.ZodType<UpdateAgentRequest, z.ZodTypeDef, unknown>;
export type UpdateAgentResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    AgentResponse?: AgentResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const UpdateAgentResponse$zodSchema: z.ZodType<UpdateAgentResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=updateagentop.d.ts.map