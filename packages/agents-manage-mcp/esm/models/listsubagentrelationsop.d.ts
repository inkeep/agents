import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { SubAgentRelationListResponse } from "./subagentrelationlistresponse.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type ListSubAgentRelationsRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    page?: number | undefined;
    limit?: number | undefined;
    sourceSubAgentId?: string | undefined;
    targetSubAgentId?: string | undefined;
    externalSubAgentId?: string | undefined;
    teamSubAgentId?: string | undefined;
};
export declare const ListSubAgentRelationsRequest$zodSchema: z.ZodType<ListSubAgentRelationsRequest, z.ZodTypeDef, unknown>;
export type ListSubAgentRelationsResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    SubAgentRelationListResponse?: SubAgentRelationListResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const ListSubAgentRelationsResponse$zodSchema: z.ZodType<ListSubAgentRelationsResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=listsubagentrelationsop.d.ts.map