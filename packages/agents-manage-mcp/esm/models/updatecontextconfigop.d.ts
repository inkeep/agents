import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { ContextConfigResponse } from "./contextconfigresponse.js";
import { ContextConfigUpdate } from "./contextconfigupdate.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type UpdateContextConfigRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    id: string;
    body?: ContextConfigUpdate | undefined;
};
export declare const UpdateContextConfigRequest$zodSchema: z.ZodType<UpdateContextConfigRequest, z.ZodTypeDef, unknown>;
export type UpdateContextConfigResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    ContextConfigResponse?: ContextConfigResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const UpdateContextConfigResponse$zodSchema: z.ZodType<UpdateContextConfigResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=updatecontextconfigop.d.ts.map