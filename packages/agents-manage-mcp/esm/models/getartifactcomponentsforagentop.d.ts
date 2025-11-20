import * as z from "zod";
import { ArtifactComponentArrayResponse } from "./artifactcomponentarrayresponse.js";
import { BadRequest } from "./badrequest.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type GetArtifactComponentsForAgentRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    subAgentId: string;
};
export declare const GetArtifactComponentsForAgentRequest$zodSchema: z.ZodType<GetArtifactComponentsForAgentRequest, z.ZodTypeDef, unknown>;
export type GetArtifactComponentsForAgentResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    ArtifactComponentArrayResponse?: ArtifactComponentArrayResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const GetArtifactComponentsForAgentResponse$zodSchema: z.ZodType<GetArtifactComponentsForAgentResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=getartifactcomponentsforagentop.d.ts.map