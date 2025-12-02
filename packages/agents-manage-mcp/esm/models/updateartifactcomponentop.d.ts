import * as z from 'zod';
import { type ArtifactComponentResponse } from './artifactcomponentresponse.js';
import { type ArtifactComponentUpdate } from './artifactcomponentupdate.js';
import { type BadRequest } from './badrequest.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type UpdateArtifactComponentRequest = {
    tenantId: string;
    projectId: string;
    id: string;
    body?: ArtifactComponentUpdate | undefined;
};
export declare const UpdateArtifactComponentRequest$zodSchema: z.ZodType<UpdateArtifactComponentRequest, z.ZodTypeDef, unknown>;
export type UpdateArtifactComponentResponse = {
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
export declare const UpdateArtifactComponentResponse$zodSchema: z.ZodType<UpdateArtifactComponentResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=updateartifactcomponentop.d.ts.map