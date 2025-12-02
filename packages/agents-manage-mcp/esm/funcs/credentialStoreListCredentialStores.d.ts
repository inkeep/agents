import type { InkeepAgentsCore } from '../core.js';
import type { RequestOptions } from '../lib/sdks.js';
import type { APIError } from '../models/errors/apierror.js';
import type { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from '../models/errors/httpclienterrors.js';
import type { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import { type ListCredentialStoresRequest, type ListCredentialStoresResponse } from '../models/listcredentialstoresop.js';
import { APIPromise } from '../types/async.js';
import type { Result } from '../types/fp.js';
export declare enum ListCredentialStoresAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * List Credential Stores
 */
export declare function credentialStoreListCredentialStores(client$: InkeepAgentsCore, request: ListCredentialStoresRequest, options?: RequestOptions): APIPromise<Result<ListCredentialStoresResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=credentialStoreListCredentialStores.d.ts.map