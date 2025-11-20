import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { ExistsResponse } from "./existsresponse.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type CheckDataComponentAgentAssociationRequest = {
    tenantId: string;
    projectId: string;
    agentId: string;
    subAgentId: string;
    dataComponentId: string;
};
export declare const CheckDataComponentAgentAssociationRequest$zodSchema: z.ZodType<CheckDataComponentAgentAssociationRequest, z.ZodTypeDef, unknown>;
export type CheckDataComponentAgentAssociationResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    ExistsResponse?: ExistsResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const CheckDataComponentAgentAssociationResponse$zodSchema: z.ZodType<CheckDataComponentAgentAssociationResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=checkdatacomponentagentassociationop.d.ts.map