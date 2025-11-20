import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { DeleteApiKeyRequest, DeleteApiKeyResponse } from "../models/deleteapikeyop.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
/**
 * Delete API Key
 *
 * @remarks
 * Delete an API key permanently
 */
export declare function apiKeysDeleteAPIKey(client$: InkeepAgentsCore, request: DeleteApiKeyRequest, options?: RequestOptions): APIPromise<Result<DeleteApiKeyResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=apiKeysDeleteAPIKey.d.ts.map