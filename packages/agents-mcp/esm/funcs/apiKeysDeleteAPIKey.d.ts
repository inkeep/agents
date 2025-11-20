import type { InkeepAgentsCore } from '../core.js';
import type { RequestOptions } from '../lib/sdks.js';
import { type DeleteApiKeyRequest, type DeleteApiKeyResponse } from '../models/deleteapikeyop.js';
import type { APIError } from '../models/errors/apierror.js';
import type { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from '../models/errors/httpclienterrors.js';
import type { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import { APIPromise } from '../types/async.js';
import type { Result } from '../types/fp.js';
/**
 * Delete API Key
 *
 * @remarks
 * Delete an API key permanently
 */
export declare function apiKeysDeleteAPIKey(client$: InkeepAgentsCore, request: DeleteApiKeyRequest, options?: RequestOptions): APIPromise<Result<DeleteApiKeyResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=apiKeysDeleteAPIKey.d.ts.map