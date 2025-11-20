import * as z from 'zod';
import { type BadRequest } from './badrequest.js';
import { type ExternalAgentCreate } from './externalagentcreate.js';
import { type ExternalAgentResponse } from './externalagentresponse.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type CreateExternalAgentRequest = {
    tenantId: string;
    projectId: string;
    body?: ExternalAgentCreate | undefined;
};
export declare const CreateExternalAgentRequest$zodSchema: z.ZodType<CreateExternalAgentRequest, z.ZodTypeDef, unknown>;
export type CreateExternalAgentResponse = {
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
export declare const CreateExternalAgentResponse$zodSchema: z.ZodType<CreateExternalAgentResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=createexternalagentop.d.ts.map