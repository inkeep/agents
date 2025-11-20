import * as z from 'zod';
import { type BadRequest } from './badrequest.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type SubAgentCreate } from './subagentcreate.js';
import { type SubAgentResponse } from './subagentresponse.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
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