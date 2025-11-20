import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { SubAgentTeamAgentRelationListResponse } from "./subagentteamagentrelationlistresponse.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type ListSubAgentTeamAgentRelationsRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    subAgentId: string;
    page?: number | undefined;
    limit?: number | undefined;
};
export declare const ListSubAgentTeamAgentRelationsRequest$zodSchema: z.ZodType<ListSubAgentTeamAgentRelationsRequest, z.ZodTypeDef, unknown>;
export type ListSubAgentTeamAgentRelationsResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    SubAgentTeamAgentRelationListResponse?: SubAgentTeamAgentRelationListResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const ListSubAgentTeamAgentRelationsResponse$zodSchema: z.ZodType<ListSubAgentTeamAgentRelationsResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=listsubagentteamagentrelationsop.d.ts.map