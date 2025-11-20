import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { CredentialReferenceResponse } from "./credentialreferenceresponse.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type GetCredentialByIdRequest = {
    tenantId: string;
    projectId: string;
    id: string;
};
export declare const GetCredentialByIdRequest$zodSchema: z.ZodType<GetCredentialByIdRequest, z.ZodTypeDef, unknown>;
export type GetCredentialByIdResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    CredentialReferenceResponse?: CredentialReferenceResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const GetCredentialByIdResponse$zodSchema: z.ZodType<GetCredentialByIdResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=getcredentialbyidop.d.ts.map