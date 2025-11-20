import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { CredentialReferenceResponse } from "./credentialreferenceresponse.js";
import { CredentialReferenceUpdate } from "./credentialreferenceupdate.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type UpdateCredentialRequest = {
    tenantId: string;
    projectId: string;
    id: string;
    body?: CredentialReferenceUpdate | undefined;
};
export declare const UpdateCredentialRequest$zodSchema: z.ZodType<UpdateCredentialRequest, z.ZodTypeDef, unknown>;
export type UpdateCredentialResponse = {
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
export declare const UpdateCredentialResponse$zodSchema: z.ZodType<UpdateCredentialResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=updatecredentialop.d.ts.map