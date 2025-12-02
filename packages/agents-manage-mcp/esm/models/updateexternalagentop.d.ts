import * as z from 'zod';
import { type BadRequest } from './badrequest.js';
import { type ExternalAgentResponse } from './externalagentresponse.js';
import { type ExternalAgentUpdate } from './externalagentupdate.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type UpdateExternalAgentRequest = {
    tenantId: string;
    projectId: string;
    id: string;
    body?: ExternalAgentUpdate | undefined;
};
export declare const UpdateExternalAgentRequest$zodSchema: z.ZodType<UpdateExternalAgentRequest, z.ZodTypeDef, unknown>;
export type UpdateExternalAgentResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    ExternalAgentResponse?: ExternalAgentResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const UpdateExternalAgentResponse$zodSchema: z.ZodType<UpdateExternalAgentResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=updateexternalagentop.d.ts.map