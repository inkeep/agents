import * as z from "zod";
import { ArtifactComponentListResponse } from "./artifactcomponentlistresponse.js";
import { BadRequest } from "./badrequest.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
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