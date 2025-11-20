import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { SubAgentExternalAgentRelationResponse } from "./subagentexternalagentrelationresponse.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type GetSubAgentExternalAgentRelationByIdRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    subAgentId: string;
    id: string;
};
export declare const GetSubAgentExternalAgentRelationByIdRequest$zodSchema: z.ZodType<GetSubAgentExternalAgentRelationByIdRequest, z.ZodTypeDef, unknown>;
export type GetSubAgentExternalAgentRelationByIdResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    SubAgentExternalAgentRelationResponse?: SubAgentExternalAgentRelationResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const GetSubAgentExternalAgentRelationByIdResponse$zodSchema: z.ZodType<GetSubAgentExternalAgentRelationByIdResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=getsubagentexternalagentrelationbyidop.d.ts.map