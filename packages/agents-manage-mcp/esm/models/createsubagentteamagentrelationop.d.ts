import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { SubAgentTeamAgentRelationCreate } from "./subagentteamagentrelationcreate.js";
import { SubAgentTeamAgentRelationResponse } from "./subagentteamagentrelationresponse.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type CreateSubAgentTeamAgentRelationRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    subAgentId: string;
    body?: SubAgentTeamAgentRelationCreate | undefined;
};
export declare const CreateSubAgentTeamAgentRelationRequest$zodSchema: z.ZodType<CreateSubAgentTeamAgentRelationRequest, z.ZodTypeDef, unknown>;
export type CreateSubAgentTeamAgentRelationResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    SubAgentTeamAgentRelationResponse?: SubAgentTeamAgentRelationResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const CreateSubAgentTeamAgentRelationResponse$zodSchema: z.ZodType<CreateSubAgentTeamAgentRelationResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=createsubagentteamagentrelationop.d.ts.map