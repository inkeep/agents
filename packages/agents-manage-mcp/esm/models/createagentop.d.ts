import * as z from "zod";
import { AgentCreate } from "./agentcreate.js";
import { AgentResponse } from "./agentresponse.js";
import { BadRequest } from "./badrequest.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
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