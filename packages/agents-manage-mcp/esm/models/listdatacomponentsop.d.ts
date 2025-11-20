import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { DataComponentListResponse } from "./datacomponentlistresponse.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type ListDataComponentsRequest = {
    tenantId: string;
    projectId: string;
    page?: number | undefined;
    limit?: number | undefined;
};
export declare const ListDataComponentsRequest$zodSchema: z.ZodType<ListDataComponentsRequest, z.ZodTypeDef, unknown>;
export type ListDataComponentsResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    DataComponentListResponse?: DataComponentListResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const ListDataComponentsResponse$zodSchema: z.ZodType<ListDataComponentsResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=listdatacomponentsop.d.ts.map