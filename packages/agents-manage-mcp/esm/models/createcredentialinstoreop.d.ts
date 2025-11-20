import * as z from "zod";
import { BadRequest } from "./badrequest.js";
import { CreateCredentialInStoreRequest } from "./createcredentialinstorerequest.js";
import { CreateCredentialInStoreResponse } from "./createcredentialinstoreresponse.js";
import { Forbidden } from "./forbidden.js";
import { InternalServerError } from "./internalservererror.js";
import { NotFound } from "./notfound.js";
import { Unauthorized } from "./unauthorized.js";
import { UnprocessableEntity } from "./unprocessableentity.js";
export type CreateCredentialInStoreRequestRequest = {
    tenantId: string;
    projectId: string;
    id: string;
    body?: CreateCredentialInStoreRequest | undefined;
};
export declare const CreateCredentialInStoreRequestRequest$zodSchema: z.ZodType<CreateCredentialInStoreRequestRequest, z.ZodTypeDef, unknown>;
export type CreateCredentialInStoreResponseResponse = {
    ContentType: string;
    StatusCode: number;
    RawResponse: Response;
    CreateCredentialInStoreResponse?: CreateCredentialInStoreResponse | undefined;
    BadRequest?: BadRequest | undefined;
    Unauthorized?: Unauthorized | undefined;
    Forbidden?: Forbidden | undefined;
    NotFound?: NotFound | undefined;
    UnprocessableEntity?: UnprocessableEntity | undefined;
    InternalServerError?: InternalServerError | undefined;
};
export declare const CreateCredentialInStoreResponseResponse$zodSchema: z.ZodType<CreateCredentialInStoreResponseResponse, z.ZodTypeDef, unknown>;
//# sourceMappingURL=createcredentialinstoreop.d.ts.map