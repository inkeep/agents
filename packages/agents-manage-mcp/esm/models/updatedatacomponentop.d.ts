import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { DataComponentResponse } from "./datacomponentresponse.js";
import { DataComponentUpdate } from "./datacomponentupdate.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type UpdateDataComponentRequest = {
    tenantId: string;
    projectId: string;
    id: string;
    body?: DataComponentUpdate | undefined;
};
export declare const UpdateDataComponentRequest$zodSchema: z.ZodType<UpdateDataComponentRequest, z.ZodTypeDef, unknown>;
export type UpdateDataComponentResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    DataComponentResponse?: DataComponentResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const UpdateDataComponentResponse$zodSchema: z.ZodType<UpdateDataComponentResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=updatedatacomponentop.d.ts.map