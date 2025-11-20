import * as z from "zod";
import { ArtifactComponentResponse } from "./artifactcomponentresponse.js";
import { BadRequest } from "./badrequest.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
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