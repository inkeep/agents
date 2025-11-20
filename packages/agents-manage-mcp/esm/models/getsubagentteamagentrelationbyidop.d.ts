import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { SubAgentTeamAgentRelationResponse } from "./subagentteamagentrelationresponse.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type GetSubAgentTeamAgentRelationByIdRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    subAgentId: string;
    id: string;
};
export declare const GetSubAgentTeamAgentRelationByIdRequest$zodSchema: z.ZodType<GetSubAgentTeamAgentRelationByIdRequest, z.ZodTypeDef, unknown>;
export type GetSubAgentTeamAgentRelationByIdResponse = {
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
export declare const GetSubAgentTeamAgentRelationByIdResponse$zodSchema: z.ZodType<GetSubAgentTeamAgentRelationByIdResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=getsubagentteamagentrelationbyidop.d.ts.map