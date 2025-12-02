import * as z from 'zod';
import { type AgentWithinContextOfProjectResponse } from './agentwithincontextofprojectresponse.js';
import { type BadRequest } from './badrequest.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type GetFullAgentDefinitionRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
};
export declare const GetFullAgentDefinitionRequest$zodSchema: z.ZodType<GetFullAgentDefinitionRequest, z.ZodTypeDef, unknown>;
export type GetFullAgentDefinitionResponse = {
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
export declare const GetFullAgentDefinitionResponse$zodSchema: z.ZodType<GetFullAgentDefinitionResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=getfullagentdefinitionop.d.ts.map