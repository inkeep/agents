import type { InkeepAgentsCore } from '../core.js';
import type { RequestOptions } from '../lib/sdks.js';
import { type CreateCredentialInStoreRequestRequest, type CreateCredentialInStoreResponseResponse } from '../models/createcredentialinstoreop.js';
import type { APIError } from '../models/errors/apierror.js';
import type { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from '../models/errors/httpclienterrors.js';
import type { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import { APIPromise } from '../types/async.js';
import type { Result } from '../types/fp.js';
export declare enum CreateCredentialInStoreAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Create Credential in Store
 */
export declare function credentialStoreCreateCredentialInStore(client$: InkeepAgentsCore, request: CreateCredentialInStoreRequestRequest, options?: RequestOptions): APIPromise<Result<CreateCredentialInStoreResponseResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=credentialStoreCreateCredentialInStore.d.ts.map