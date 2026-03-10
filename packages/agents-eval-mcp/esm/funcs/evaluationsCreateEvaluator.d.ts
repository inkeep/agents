import { InkeepAgentsCore } from '../core.js';
import { RequestOptions } from '../lib/sdks.js';
import { CreateEvaluatorRequest, CreateEvaluatorResponse } from '../models/createevaluatorop.js';
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
export declare enum CreateEvaluatorAcceptEnum {
  applicationJsonAccept = 'application/json',
  applicationProblemPlusJsonAccept = 'application/problem+json',
}
/**
 * Create Evaluator
 */
export declare function evaluationsCreateEvaluator(
  client$: InkeepAgentsCore,
  request: CreateEvaluatorRequest,
  options?: RequestOptions
): APIPromise<
  Result<
    CreateEvaluatorResponse,
    | APIError
    | SDKValidationError
    | UnexpectedClientError
    | InvalidRequestError
    | RequestAbortedError
    | RequestTimeoutError
    | ConnectionError
  >
>;
//# sourceMappingURL=evaluationsCreateEvaluator.d.ts.map
