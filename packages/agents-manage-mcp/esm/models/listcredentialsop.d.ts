import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { CredentialReferenceListResponse } from "./credentialreferencelistresponse.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type ListCredentialsRequest = {
    tenantId: string;
    projectId: string;
    page?: number | undefined;
    limit?: number | undefined;
};
export declare const ListCredentialsRequest$zodSchema: z.ZodType<ListCredentialsRequest, z.ZodTypeDef, unknown>;
export type ListCredentialsResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    CredentialReferenceListResponse?: CredentialReferenceListResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const ListCredentialsResponse$zodSchema: z.ZodType<ListCredentialsResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=listcredentialsop.d.ts.map