import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { RelatedAgentInfoListResponse } from "./relatedagentinfolistresponse.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type GetRelatedAgentInfosRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    subAgentId: string;
};
export declare const GetRelatedAgentInfosRequest$zodSchema: z.ZodType<GetRelatedAgentInfosRequest, z.ZodTypeDef, unknown>;
export type GetRelatedAgentInfosResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    RelatedAgentInfoListResponse?: RelatedAgentInfoListResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const GetRelatedAgentInfosResponse$zodSchema: z.ZodType<GetRelatedAgentInfosResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=getrelatedagentinfosop.d.ts.map