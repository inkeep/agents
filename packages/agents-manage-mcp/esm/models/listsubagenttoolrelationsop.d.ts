import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { SubAgentToolRelationListResponse } from "./subagenttoolrelationlistresponse.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type ListSubagentToolRelationsRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    page?: number | undefined;
    limit?: number | undefined;
    subAgentId?: string | undefined;
    toolId?: string | undefined;
};
export declare const ListSubagentToolRelationsRequest$zodSchema: z.ZodType<ListSubagentToolRelationsRequest, z.ZodTypeDef, unknown>;
export type ListSubagentToolRelationsResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    SubAgentToolRelationListResponse?: SubAgentToolRelationListResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const ListSubagentToolRelationsResponse$zodSchema: z.ZodType<ListSubagentToolRelationsResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=listsubagenttoolrelationsop.d.ts.map