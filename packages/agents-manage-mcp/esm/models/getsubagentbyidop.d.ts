import * as z from 'zod';
import { type BadRequest } from './badrequest.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type SubAgentResponse } from './subagentresponse.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type GetSubagentByIdRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    id: string;
};
export declare const GetSubagentByIdRequest$zodSchema: z.ZodType<GetSubagentByIdRequest, z.ZodTypeDef, unknown>;
export type GetSubagentByIdResponse = {
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
export declare const GetSubagentByIdResponse$zodSchema: z.ZodType<GetSubagentByIdResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=getsubagentbyidop.d.ts.map