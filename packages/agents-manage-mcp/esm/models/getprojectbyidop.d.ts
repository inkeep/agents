import * as z from 'zod';
import { type BadRequest } from './badrequest.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type ProjectResponse } from './projectresponse.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type GetProjectByIdRequest = {
    tenantId: string;
    id: string;
};
export declare const GetProjectByIdRequest$zodSchema: z.ZodType<GetProjectByIdRequest, z.ZodTypeDef, unknown>;
export type GetProjectByIdResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    ProjectResponse?: ProjectResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const GetProjectByIdResponse$zodSchema: z.ZodType<GetProjectByIdResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=getprojectbyidop.d.ts.map