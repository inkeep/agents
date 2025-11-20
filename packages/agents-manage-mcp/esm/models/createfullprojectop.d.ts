import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { ErrorResponse } from "./errorresponse.js";
import { Forbidden } from "./forbidden.js";
import { FullProjectDefinition } from "./fullprojectdefinition.js";
import { FullProjectDefinitionResponse } from "./fullprojectdefinitionresponse.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
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