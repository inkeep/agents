import * as z from "zod";
import { AgentWithinContextOfProjectResponse } from "./agentwithincontextofprojectresponse.js";
import { BadRequest } from "./badrequest.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
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