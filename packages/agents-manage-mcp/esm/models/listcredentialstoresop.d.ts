import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { CredentialStoreListResponse } from "./credentialstorelistresponse.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type ListCredentialStoresRequest = {
    tenantId: string;
    projectId: string;
};
export declare const ListCredentialStoresRequest$zodSchema: z.ZodType<ListCredentialStoresRequest, z.ZodTypeDef, unknown>;
export type ListCredentialStoresResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    CredentialStoreListResponse?: CredentialStoreListResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const ListCredentialStoresResponse$zodSchema: z.ZodType<ListCredentialStoresResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=listcredentialstoresop.d.ts.map