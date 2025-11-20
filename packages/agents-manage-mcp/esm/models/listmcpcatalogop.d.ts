import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { MCPCatalogListResponse } from "./mcpcataloglistresponse.js";
import { NotFound } from "./notfound.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type ListMcpCatalogRequest = {
    tenantId: string;
    projectId: string;
};
export declare const ListMcpCatalogRequest$zodSchema: z.ZodType<ListMcpCatalogRequest, z.ZodTypeDef, unknown>;
export type ListMcpCatalogResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    MCPCatalogListResponse?: MCPCatalogListResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const ListMcpCatalogResponse$zodSchema: z.ZodType<ListMcpCatalogResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=listmcpcatalogop.d.ts.map