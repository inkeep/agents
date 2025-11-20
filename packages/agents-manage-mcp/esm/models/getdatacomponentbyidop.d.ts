import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { DataComponentResponse } from "./datacomponentresponse.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type GetDataComponentByIdRequest = {
    tenantId: string;
    projectId: string;
    id: string;
};
export declare const GetDataComponentByIdRequest$zodSchema: z.ZodType<GetDataComponentByIdRequest, z.ZodTypeDef, unknown>;
export type GetDataComponentByIdResponse = {
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
export declare const GetDataComponentByIdResponse$zodSchema: z.ZodType<GetDataComponentByIdResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=getdatacomponentbyidop.d.ts.map