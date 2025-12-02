import * as z from 'zod';
import { type BadRequest } from './badrequest.js';
import { type ErrorResponse } from './errorresponse.js';
import { type Forbidden } from './forbidden.js';
import { type FullProjectDefinition } from './fullprojectdefinition.js';
import { type FullProjectDefinitionResponse } from './fullprojectdefinitionresponse.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type CreateFullProjectRequest = {
    tenantId: string;
    body?: FullProjectDefinition | undefined;
};
export declare const CreateFullProjectRequest$zodSchema: z.ZodType<CreateFullProjectRequest, z.ZodTypeDef, unknown>;
export type CreateFullProjectResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    FullProjectDefinitionResponse?: FullProjectDefinitionResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    ErrorResponse?: ErrorResponse | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const CreateFullProjectResponse$zodSchema: z.ZodType<CreateFullProjectResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=createfullprojectop.d.ts.map