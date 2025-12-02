import * as z from 'zod';
import { type BadRequest } from './badrequest.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type McpToolResponse } from './mcptoolresponse.js';
import { type NotFound } from './notfound.js';
import { type ToolCreate } from './toolcreate.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type CreateToolRequest = {
    tenantId: string;
    projectId: string;
    body?: ToolCreate | undefined;
};
export declare const CreateToolRequest$zodSchema: z.ZodType<CreateToolRequest, z.ZodTypeDef, unknown>;
export type CreateToolResponse = {
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
export declare const CreateToolResponse$zodSchema: z.ZodType<CreateToolResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=createtoolop.d.ts.map