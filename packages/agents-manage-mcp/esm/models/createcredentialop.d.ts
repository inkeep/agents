import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { CredentialReferenceCreate } from "./credentialreferencecreate.js";
import { CredentialReferenceResponse } from "./credentialreferenceresponse.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type CreateCredentialRequest = {
    tenantId: string;
    projectId: string;
    body?: CredentialReferenceCreate | undefined;
};
export declare const CreateCredentialRequest$zodSchema: z.ZodType<CreateCredentialRequest, z.ZodTypeDef, unknown>;
export type CreateCredentialResponse = {
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
export declare const CreateCredentialResponse$zodSchema: z.ZodType<CreateCredentialResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=createcredentialop.d.ts.map