import * as z from 'zod';
import { type BadRequest } from './badrequest.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type DeleteContextConfigRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    id: string;
};
export declare const DeleteContextConfigRequest$zodSchema: z.ZodType<DeleteContextConfigRequest, z.ZodTypeDef, unknown>;
export type DeleteContextConfigResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const DeleteContextConfigResponse$zodSchema: z.ZodType<DeleteContextConfigResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=deletecontextconfigop.d.ts.map