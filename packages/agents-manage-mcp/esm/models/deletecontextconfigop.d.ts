import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type DeleteContextConfigRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    id: string;
};
export declare const DeleteContextConfigRequest$zodSchema: z.ZodType<DeleteContextConfigRequest, z.ZodTypeDef, unknown>;
export type DeleteContextConfigResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const DeleteContextConfigResponse$zodSchema: z.ZodType<DeleteContextConfigResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=deletecontextconfigop.d.ts.map