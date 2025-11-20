import * as z from "zod";
import { AgentWithinContextOfProjectResponse } from "./agentwithincontextofprojectresponse.js";
import { BadRequest } from "./badrequest.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
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