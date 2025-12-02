import * as z from 'zod';
import { type AgentWithinContextOfProject } from './agentwithincontextofproject.js';
import { type AgentWithinContextOfProjectResponse } from './agentwithincontextofprojectresponse.js';
import { type BadRequest } from './badrequest.js';
import { type ErrorResponse } from './errorresponse.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type CreateFullAgentRequest = {
    tenantId: string;
    projectId: string;
    body?: AgentWithinContextOfProject | undefined;
};
export declare const CreateFullAgentRequest$zodSchema: z.ZodType<CreateFullAgentRequest, z.ZodTypeDef, unknown>;
export type CreateFullAgentResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    AgentWithinContextOfProjectResponse?: AgentWithinContextOfProjectResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    ErrorResponse?: ErrorResponse | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const CreateFullAgentResponse$zodSchema: z.ZodType<CreateFullAgentResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=createfullagentop.d.ts.map