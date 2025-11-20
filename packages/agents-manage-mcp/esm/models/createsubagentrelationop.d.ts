import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { SubAgentRelationCreate } from "./subagentrelationcreate.js";
import { SubAgentRelationResponse } from "./subagentrelationresponse.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type CreateSubAgentRelationRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    body?: SubAgentRelationCreate | undefined;
};
export declare const CreateSubAgentRelationRequest$zodSchema: z.ZodType<CreateSubAgentRelationRequest, z.ZodTypeDef, unknown>;
export type CreateSubAgentRelationResponse = {
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
export declare const CreateSubAgentRelationResponse$zodSchema: z.ZodType<CreateSubAgentRelationResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=createsubagentrelationop.d.ts.map