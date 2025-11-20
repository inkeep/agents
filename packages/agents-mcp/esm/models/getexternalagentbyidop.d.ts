import * as z from 'zod';
import { type BadRequest } from './badrequest.js';
import { type ExternalAgentResponse } from './externalagentresponse.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type GetExternalAgentByIdRequest = {
    tenantId: string;
    projectId: string;
    id: string;
};
export declare const GetExternalAgentByIdRequest$zodSchema: z.ZodType<GetExternalAgentByIdRequest, z.ZodTypeDef, unknown>;
export type GetExternalAgentByIdResponse = {
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
export declare const GetExternalAgentByIdResponse$zodSchema: z.ZodType<GetExternalAgentByIdResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=getexternalagentbyidop.d.ts.map