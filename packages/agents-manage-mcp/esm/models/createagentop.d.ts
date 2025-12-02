import * as z from 'zod';
import { type AgentCreate } from './agentcreate.js';
import { type AgentResponse } from './agentresponse.js';
import { type BadRequest } from './badrequest.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type CreateAgentRequest = {
    tenantId: string;
    projectId: string;
    body?: AgentCreate | undefined;
};
export declare const CreateAgentRequest$zodSchema: z.ZodType<CreateAgentRequest, z.ZodTypeDef, unknown>;
export type CreateAgentResponse = {
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
export declare const CreateAgentResponse$zodSchema: z.ZodType<CreateAgentResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=createagentop.d.ts.map