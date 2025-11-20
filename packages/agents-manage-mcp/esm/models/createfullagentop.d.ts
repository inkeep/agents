import * as z from "zod";
import { AgentWithinContextOfProject } from "./agentwithincontextofproject.js";
import { AgentWithinContextOfProjectResponse } from "./agentwithincontextofprojectresponse.js";
import { BadRequest } from "./badrequest.js";
import { ErrorResponse } from "./errorresponse.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
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