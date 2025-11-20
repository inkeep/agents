import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { SubAgentExternalAgentRelationListResponse } from "./subagentexternalagentrelationlistresponse.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type ListSubAgentExternalAgentRelationsRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    subAgentId: string;
    page?: number | undefined;
    limit?: number | undefined;
};
export declare const ListSubAgentExternalAgentRelationsRequest$zodSchema: z.ZodType<ListSubAgentExternalAgentRelationsRequest, z.ZodTypeDef, unknown>;
export type ListSubAgentExternalAgentRelationsResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    SubAgentExternalAgentRelationListResponse?: SubAgentExternalAgentRelationListResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const ListSubAgentExternalAgentRelationsResponse$zodSchema: z.ZodType<ListSubAgentExternalAgentRelationsResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=listsubagentexternalagentrelationsop.d.ts.map