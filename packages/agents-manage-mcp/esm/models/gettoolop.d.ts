import * as z from 'zod';
import { type BadRequest } from './badrequest.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type McpToolResponse } from './mcptoolresponse.js';
import { type NotFound } from './notfound.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type GetToolRequest = {
    tenantId: string;
    projectId: string;
    id: string;
};
export declare const GetToolRequest$zodSchema: z.ZodType<GetToolRequest, z.ZodTypeDef, unknown>;
export type GetToolResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    McpToolResponse?: McpToolResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const GetToolResponse$zodSchema: z.ZodType<GetToolResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=gettoolop.d.ts.map