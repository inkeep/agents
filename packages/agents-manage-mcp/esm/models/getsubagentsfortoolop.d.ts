import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { SubAgentToolRelationListResponse } from "./subagenttoolrelationlistresponse.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type GetSubagentsForToolRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    toolId: string;
    page?: number | undefined;
    limit?: number | undefined;
};
export declare const GetSubagentsForToolRequest$zodSchema: z.ZodType<GetSubagentsForToolRequest, z.ZodTypeDef, unknown>;
export type GetSubagentsForToolResponse = {
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
export declare const GetSubagentsForToolResponse$zodSchema: z.ZodType<GetSubagentsForToolResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=getsubagentsfortoolop.d.ts.map