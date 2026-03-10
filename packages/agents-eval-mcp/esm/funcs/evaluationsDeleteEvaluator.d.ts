import { InkeepAgentsCore } from '../core.js';
import { RequestOptions } from '../lib/sdks.js';
import { DeleteEvaluatorRequest, DeleteEvaluatorResponse } from '../models/deleteevaluatorop.js';
import { APIError } from '../models/errors/apierror.js';
import {
  ConnectionError,
  InvalidRequestError,
  RequestAbortedError,
  RequestTimeoutError,
  UnexpectedClientError,
} from '../models/errors/httpclienterrors.js';
import { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import { APIPromise } from '../types/async.js';
import { Result } from '../types/fp.js';
/**
 * Delete Evaluator
 */
export declare function evaluationsDeleteEvaluator(
  client$: InkeepAgentsCore,
  request: DeleteEvaluatorRequest,
  options?: RequestOptions
): APIPromise<
  Result<
    DeleteEvaluatorResponse,
    | APIError
    | SDKValidationError
    | UnexpectedClientError
    | InvalidRequestError
    | RequestAbortedError
    | RequestTimeoutError
    | ConnectionError
  >
>;
//# sourceMappingURL=evaluationsDeleteEvaluator.d.ts.map
