import * as z from 'zod';
import { type ArtifactComponentListResponse } from './artifactcomponentlistresponse.js';
import { type BadRequest } from './badrequest.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type ListArtifactComponentsRequest = {
    tenantId: string;
    projectId: string;
    page?: number | undefined;
    limit?: number | undefined;
};
export declare const ListArtifactComponentsRequest$zodSchema: z.ZodType<ListArtifactComponentsRequest, z.ZodTypeDef, unknown>;
export type ListArtifactComponentsResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    ArtifactComponentListResponse?: ArtifactComponentListResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const ListArtifactComponentsResponse$zodSchema: z.ZodType<ListArtifactComponentsResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=listartifactcomponentsop.d.ts.map