import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { DataComponentCreate } from "./datacomponentcreate.js";
import { DataComponentResponse } from "./datacomponentresponse.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type CreateDataComponentRequest = {
    tenantId: string;
    projectId: string;
    body?: DataComponentCreate | undefined;
};
export declare const CreateDataComponentRequest$zodSchema: z.ZodType<CreateDataComponentRequest, z.ZodTypeDef, unknown>;
export type CreateDataComponentResponse = {
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
export declare const CreateDataComponentResponse$zodSchema: z.ZodType<CreateDataComponentResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=createdatacomponentop.d.ts.map