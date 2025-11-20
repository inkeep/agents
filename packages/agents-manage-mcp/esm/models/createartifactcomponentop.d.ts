import * as z from "zod";
import { ArtifactComponentCreate } from "./artifactcomponentcreate.js";
import { ArtifactComponentResponse } from "./artifactcomponentresponse.js";
import { BadRequest } from "./badrequest.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type CreateArtifactComponentRequest = {
    tenantId: string;
    projectId: string;
    body?: ArtifactComponentCreate | undefined;
};
export declare const CreateArtifactComponentRequest$zodSchema: z.ZodType<CreateArtifactComponentRequest, z.ZodTypeDef, unknown>;
export type CreateArtifactComponentResponse = {
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
export declare const CreateArtifactComponentResponse$zodSchema: z.ZodType<CreateArtifactComponentResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=createartifactcomponentop.d.ts.map