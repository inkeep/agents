import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { SubAgentListResponse } from "./subagentlistresponse.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type ListSubagentsRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    page?: number | undefined;
    limit?: number | undefined;
};
export declare const ListSubagentsRequest$zodSchema: z.ZodType<ListSubagentsRequest, z.ZodTypeDef, unknown>;
export type ListSubagentsResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    SubAgentListResponse?: SubAgentListResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const ListSubagentsResponse$zodSchema: z.ZodType<ListSubagentsResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=listsubagentsop.d.ts.map