import * as z from 'zod';
import { type BadRequest } from './badrequest.js';
import { type DataComponentResponse } from './datacomponentresponse.js';
import { type DataComponentUpdate } from './datacomponentupdate.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type UpdateDataComponentRequest = {
    tenantId: string;
    projectId: string;
    id: string;
    body?: DataComponentUpdate | undefined;
};
export declare const UpdateDataComponentRequest$zodSchema: z.ZodType<UpdateDataComponentRequest, z.ZodTypeDef, unknown>;
export type UpdateDataComponentResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    DataComponentResponse?: DataComponentResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const UpdateDataComponentResponse$zodSchema: z.ZodType<UpdateDataComponentResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=updatedatacomponentop.d.ts.map