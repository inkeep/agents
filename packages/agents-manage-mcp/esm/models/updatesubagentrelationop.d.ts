import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { SubAgentRelationResponse } from "./subagentrelationresponse.js";
import { SubAgentRelationUpdate } from "./subagentrelationupdate.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type UpdateSubAgentRelationRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    id: string;
    body?: SubAgentRelationUpdate | undefined;
};
export declare const UpdateSubAgentRelationRequest$zodSchema: z.ZodType<UpdateSubAgentRelationRequest, z.ZodTypeDef, unknown>;
export type UpdateSubAgentRelationResponse = {
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
export declare const UpdateSubAgentRelationResponse$zodSchema: z.ZodType<UpdateSubAgentRelationResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=updatesubagentrelationop.d.ts.map