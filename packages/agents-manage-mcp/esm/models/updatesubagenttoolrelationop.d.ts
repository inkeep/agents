import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { SubAgentToolRelationResponse } from "./subagenttoolrelationresponse.js";
import { SubAgentToolRelationUpdate } from "./subagenttoolrelationupdate.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type UpdateSubagentToolRelationRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    id: string;
    body?: SubAgentToolRelationUpdate | undefined;
};
export declare const UpdateSubagentToolRelationRequest$zodSchema: z.ZodType<UpdateSubagentToolRelationRequest, z.ZodTypeDef, unknown>;
export type UpdateSubagentToolRelationResponse = {
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
export declare const UpdateSubagentToolRelationResponse$zodSchema: z.ZodType<UpdateSubagentToolRelationResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=updatesubagenttoolrelationop.d.ts.map