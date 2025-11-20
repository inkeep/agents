import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { SubAgentRelationResponse } from "./subagentrelationresponse.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type GetSubAgentRelationByIdRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    id: string;
};
export declare const GetSubAgentRelationByIdRequest$zodSchema: z.ZodType<GetSubAgentRelationByIdRequest, z.ZodTypeDef, unknown>;
export type GetSubAgentRelationByIdResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    SubAgentRelationResponse?: SubAgentRelationResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const GetSubAgentRelationByIdResponse$zodSchema: z.ZodType<GetSubAgentRelationByIdResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=getsubagentrelationbyidop.d.ts.map