import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { SubAgentCreate } from "./subagentcreate.js";
import { SubAgentResponse } from "./subagentresponse.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type CreateSubagentRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    body?: SubAgentCreate | undefined;
};
export declare const CreateSubagentRequest$zodSchema: z.ZodType<CreateSubagentRequest, z.ZodTypeDef, unknown>;
export type CreateSubagentResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    SubAgentResponse?: SubAgentResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const CreateSubagentResponse$zodSchema: z.ZodType<CreateSubagentResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=createsubagentop.d.ts.map