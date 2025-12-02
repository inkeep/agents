import * as z from 'zod';
import { type AgentWithinContextOfProjectResponse } from './agentwithincontextofprojectresponse.js';
import { type BadRequest } from './badrequest.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type GetFullAgentRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
};
export declare const GetFullAgentRequest$zodSchema: z.ZodType<GetFullAgentRequest, z.ZodTypeDef, unknown>;
export type GetFullAgentResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    AgentWithinContextOfProjectResponse?: AgentWithinContextOfProjectResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const GetFullAgentResponse$zodSchema: z.ZodType<GetFullAgentResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=getfullagentop.d.ts.map