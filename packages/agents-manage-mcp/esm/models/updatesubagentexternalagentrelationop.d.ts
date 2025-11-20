import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { SubAgentExternalAgentRelationResponse } from "./subagentexternalagentrelationresponse.js";
import { SubAgentExternalAgentRelationUpdate } from "./subagentexternalagentrelationupdate.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type UpdateSubAgentExternalAgentRelationRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    subAgentId: string;
    id: string;
    body?: SubAgentExternalAgentRelationUpdate | undefined;
};
export declare const UpdateSubAgentExternalAgentRelationRequest$zodSchema: z.ZodType<UpdateSubAgentExternalAgentRelationRequest, z.ZodTypeDef, unknown>;
export type UpdateSubAgentExternalAgentRelationResponse = {
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
export declare const UpdateSubAgentExternalAgentRelationResponse$zodSchema: z.ZodType<UpdateSubAgentExternalAgentRelationResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=updatesubagentexternalagentrelationop.d.ts.map