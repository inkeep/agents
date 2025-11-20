import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { SubAgentExternalAgentRelationCreate } from "./subagentexternalagentrelationcreate.js";
import { SubAgentExternalAgentRelationResponse } from "./subagentexternalagentrelationresponse.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type CreateSubAgentExternalAgentRelationRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    subAgentId: string;
    body?: SubAgentExternalAgentRelationCreate | undefined;
};
export declare const CreateSubAgentExternalAgentRelationRequest$zodSchema: z.ZodType<CreateSubAgentExternalAgentRelationRequest, z.ZodTypeDef, unknown>;
export type CreateSubAgentExternalAgentRelationResponse = {
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
export declare const CreateSubAgentExternalAgentRelationResponse$zodSchema: z.ZodType<CreateSubAgentExternalAgentRelationResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=createsubagentexternalagentrelationop.d.ts.map