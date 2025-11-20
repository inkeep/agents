import * as z from 'zod';
import { type BadRequest } from './badrequest.js';
import { type ComponentAssociationListResponse } from './componentassociationlistresponse.js';
import { type Forbidden } from './forbidden.js';
import { type InternalServerError } from './internalservererror.js';
import { type NotFound } from './notfound.js';
import { type Unauthorized } from './unauthorized.js';
import { type UnprocessableEntity } from './unprocessableentity.js';
export type GetAgentsUsingArtifactComponentRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    artifactComponentId: string;
};
export declare const GetAgentsUsingArtifactComponentRequest$zodSchema: z.ZodType<GetAgentsUsingArtifactComponentRequest, z.ZodTypeDef, unknown>;
export type GetAgentsUsingArtifactComponentResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    ComponentAssociationListResponse?: ComponentAssociationListResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const GetAgentsUsingArtifactComponentResponse$zodSchema: z.ZodType<GetAgentsUsingArtifactComponentResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=getagentsusingartifactcomponentop.d.ts.map