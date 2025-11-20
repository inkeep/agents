import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { SubAgentToolRelationCreate } from "./subagenttoolrelationcreate.js";
import { SubAgentToolRelationResponse } from "./subagenttoolrelationresponse.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type CreateSubagentToolRelationRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    body?: SubAgentToolRelationCreate | undefined;
};
export declare const CreateSubagentToolRelationRequest$zodSchema: z.ZodType<CreateSubagentToolRelationRequest, z.ZodTypeDef, unknown>;
export type CreateSubagentToolRelationResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    SubAgentToolRelationResponse?: SubAgentToolRelationResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const CreateSubagentToolRelationResponse$zodSchema: z.ZodType<CreateSubagentToolRelationResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=createsubagenttoolrelationop.d.ts.map