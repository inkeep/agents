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
import { UpdateEvaluatorRequest, UpdateEvaluatorResponse } from '../models/updateevaluatorop.js';
import { APIPromise } from '../types/async.js';
import { Result } from '../types/fp.js';
export declare enum UpdateEvaluatorAcceptEnum {
  applicationJsonAccept = 'application/json',
  applicationProblemPlusJsonAccept = 'application/problem+json',
}
/**
 * Update Evaluator
 */
export declare function evaluationsUpdateEvaluator(
  client$: InkeepAgentsCore,
  request: UpdateEvaluatorRequest,
  options?: RequestOptions
): APIPromise<
  Result<
    UpdateEvaluatorResponse,
    | APIError
    | SDKValidationError
    | UnexpectedClientError
    | InvalidRequestError
    | RequestAbortedError
    | RequestTimeoutError
    | ConnectionError
  >
>;
//# sourceMappingURL=evaluationsUpdateEvaluator.d.ts.map
