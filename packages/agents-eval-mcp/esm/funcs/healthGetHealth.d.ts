import { InkeepAgentsCore } from '../core.js';
import { RequestOptions } from '../lib/sdks.js';
import { APIError } from '../models/errors/apierror.js';
import {
  ConnectionError,
  InvalidRequestError,
  RequestAbortedError,
  RequestTimeoutError,
  UnexpectedClientError,
} from '../models/errors/httpclienterrors.js';
import { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import { GetHealthResponse } from '../models/gethealthop.js';
import { APIPromise } from '../types/async.js';
import { Result } from '../types/fp.js';
/**
 * Health check
 *
 * @remarks
 * Check if the evaluation service is healthy
 */
export declare function healthGetHealth(
  client$: InkeepAgentsCore,
  options?: RequestOptions
): APIPromise<
  Result<
    GetHealthResponse,
    | APIError
    | SDKValidationError
    | UnexpectedClientError
    | InvalidRequestError
    | RequestAbortedError
    | RequestTimeoutError
    | ConnectionError
  >
>;
//# sourceMappingURL=healthGetHealth.d.ts.map
