import * as z from 'zod';
import { type BadRequest } from './badrequest.js';
import { type Forbidden } from './forbidden.js';
import { type FullProjectDefinitionResponse } from './fullprojectdefinitionresponse.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type GetFullProjectRequest = {
    tenantId: string;
    projectId: string;
};
export declare const GetFullProjectRequest$zodSchema: z.ZodType<GetFullProjectRequest, z.ZodTypeDef, unknown>;
export type GetFullProjectResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    FullProjectDefinitionResponse?: FullProjectDefinitionResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const GetFullProjectResponse$zodSchema: z.ZodType<GetFullProjectResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=getfullprojectop.d.ts.map