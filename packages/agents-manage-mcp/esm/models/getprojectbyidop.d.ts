import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { ProjectResponse } from "./projectresponse.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type GetProjectByIdRequest = {
    tenantId: string;
    id: string;
};
export declare const GetProjectByIdRequest$zodSchema: z.ZodType<GetProjectByIdRequest, z.ZodTypeDef, unknown>;
export type GetProjectByIdResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    ProjectResponse?: ProjectResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const GetProjectByIdResponse$zodSchema: z.ZodType<GetProjectByIdResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=getprojectbyidop.d.ts.map