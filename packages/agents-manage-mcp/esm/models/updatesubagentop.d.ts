import * as z from 'zod';
import { type BadRequest } from './badrequest.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type SubAgentResponse } from './subagentresponse.js';
import { type SubAgentUpdate } from './subagentupdate.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type UpdateSubagentRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    id: string;
    body?: SubAgentUpdate | undefined;
};
export declare const UpdateSubagentRequest$zodSchema: z.ZodType<UpdateSubagentRequest, z.ZodTypeDef, unknown>;
export type UpdateSubagentResponse = {
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
export declare const UpdateSubagentResponse$zodSchema: z.ZodType<UpdateSubagentResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=updatesubagentop.d.ts.map