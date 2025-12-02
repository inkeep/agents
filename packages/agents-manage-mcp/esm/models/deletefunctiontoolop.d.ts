import * as z from 'zod';
import { type BadRequest } from './badrequest.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type DeleteFunctionToolRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    id: string;
};
export declare const DeleteFunctionToolRequest$zodSchema: z.ZodType<DeleteFunctionToolRequest, z.ZodTypeDef, unknown>;
export type DeleteFunctionToolResponse = {
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
export declare const DeleteFunctionToolResponse$zodSchema: z.ZodType<DeleteFunctionToolResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=deletefunctiontoolop.d.ts.map