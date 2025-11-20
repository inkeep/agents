import * as z from "zod";
import { AgentWithinContextOfProject } from "./agentwithincontextofproject.js";
import { AgentWithinContextOfProjectResponse } from "./agentwithincontextofprojectresponse.js";
import { BadRequest } from "./badrequest.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
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