import * as z from 'zod';
import { type BadRequest } from './badrequest.js';
import { type Forbidden } from './forbidden.js';
import { type FullProjectDefinition } from './fullprojectdefinition.js';
import { type FullProjectDefinitionResponse } from './fullprojectdefinitionresponse.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type UpdateFullProjectRequest = {
    tenantId: string;
    projectId: string;
    body?: FullProjectDefinition | undefined;
};
export declare const UpdateFullProjectRequest$zodSchema: z.ZodType<UpdateFullProjectRequest, z.ZodTypeDef, unknown>;
export type UpdateFullProjectResponse = {
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
export declare const UpdateFullProjectResponse$zodSchema: z.ZodType<UpdateFullProjectResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=updatefullprojectop.d.ts.map