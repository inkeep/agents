import * as z from 'zod';
import { type AgentWithinContextOfProject } from './agentwithincontextofproject.js';
import { type AgentWithinContextOfProjectResponse } from './agentwithincontextofprojectresponse.js';
import { type BadRequest } from './badrequest.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type UpdateFullAgentRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    body?: AgentWithinContextOfProject | undefined;
};
export declare const UpdateFullAgentRequest$zodSchema: z.ZodType<UpdateFullAgentRequest, z.ZodTypeDef, unknown>;
export type UpdateFullAgentResponse = {
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
export declare const UpdateFullAgentResponse$zodSchema: z.ZodType<UpdateFullAgentResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=updatefullagentop.d.ts.map