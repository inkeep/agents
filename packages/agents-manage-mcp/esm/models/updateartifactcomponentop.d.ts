import * as z from "zod";
import { ArtifactComponentResponse } from "./artifactcomponentresponse.js";
import { ArtifactComponentUpdate } from "./artifactcomponentupdate.js";
import { BadRequest } from "./badrequest.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
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