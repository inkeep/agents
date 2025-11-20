import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { ContextConfigCreate } from "./contextconfigcreate.js";
import { ContextConfigResponse } from "./contextconfigresponse.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type CreateContextConfigRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    body?: ContextConfigCreate | undefined;
};
export declare const CreateContextConfigRequest$zodSchema: z.ZodType<CreateContextConfigRequest, z.ZodTypeDef, unknown>;
export type CreateContextConfigResponse = {
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
export declare const CreateContextConfigResponse$zodSchema: z.ZodType<CreateContextConfigResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=createcontextconfigop.d.ts.map