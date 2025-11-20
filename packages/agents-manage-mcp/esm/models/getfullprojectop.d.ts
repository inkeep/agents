import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { Forbidden } from "./forbidden.js";
import { FullProjectDefinitionResponse } from "./fullprojectdefinitionresponse.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type GetFullProjectRequest = {
    tenantId: string;
    projectId: string;
};
export declare const GetFullProjectRequest$zodSchema: z.ZodType<GetFullProjectRequest, z.ZodTypeDef, unknown>;
export type GetFullProjectResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    FullProjectDefinitionResponse?: FullProjectDefinitionResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const GetFullProjectResponse$zodSchema: z.ZodType<GetFullProjectResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=getfullprojectop.d.ts.map