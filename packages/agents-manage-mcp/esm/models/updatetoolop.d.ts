import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { McpToolResponse } from "./mcptoolresponse.js";
import { NotFound } from "./notfound.js";
import { ToolUpdate } from "./toolupdate.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type UpdateToolRequest = {
    tenantId: string;
    projectId: string;
    id: string;
    body?: ToolUpdate | undefined;
};
export declare const UpdateToolRequest$zodSchema: z.ZodType<UpdateToolRequest, z.ZodTypeDef, unknown>;
export type UpdateToolResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    McpToolResponse?: McpToolResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const UpdateToolResponse$zodSchema: z.ZodType<UpdateToolResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=updatetoolop.d.ts.map