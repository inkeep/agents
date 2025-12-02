import * as z from 'zod';
import { type ArtifactComponentResponse } from './artifactcomponentresponse.js';
import { type BadRequest } from './badrequest.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type GetArtifactComponentByIdRequest = {
    tenantId: string;
    projectId: string;
    id: string;
};
export declare const GetArtifactComponentByIdRequest$zodSchema: z.ZodType<GetArtifactComponentByIdRequest, z.ZodTypeDef, unknown>;
export type GetArtifactComponentByIdResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    ArtifactComponentResponse?: ArtifactComponentResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const GetArtifactComponentByIdResponse$zodSchema: z.ZodType<GetArtifactComponentByIdResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=getartifactcomponentbyidop.d.ts.map