import * as z from "zod";
import { AgentResponse } from "./agentresponse.js";
import { BadRequest } from "./badrequest.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type GetAgentRequest = {
    tenantId: string;
    projectId: string;
    id: string;
};
export declare const GetAgentRequest$zodSchema: z.ZodType<GetAgentRequest, z.ZodTypeDef, unknown>;
export type GetAgentResponse = {
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
export declare const GetAgentResponse$zodSchema: z.ZodType<GetAgentResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=getagentop.d.ts.map