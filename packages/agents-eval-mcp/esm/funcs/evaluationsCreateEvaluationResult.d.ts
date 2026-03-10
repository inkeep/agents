import { InkeepAgentsCore } from '../core.js';
import { RequestOptions } from '../lib/sdks.js';
import {
  CreateEvaluationResultRequest,
  CreateEvaluationResultResponse,
} from '../models/createevaluationresultop.js';
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
export declare enum CreateEvaluationResultAcceptEnum {
  applicationJsonAccept = 'application/json',
  applicationProblemPlusJsonAccept = 'application/problem+json',
}
/**
 * Create Evaluation Result
 */
export declare function evaluationsCreateEvaluationResult(
  client$: InkeepAgentsCore,
  request: CreateEvaluationResultRequest,
  options?: RequestOptions
): APIPromise<
  Result<
    CreateEvaluationResultResponse,
    | APIError
    | SDKValidationError
    | UnexpectedClientError
    | InvalidRequestError
    | RequestAbortedError
    | RequestTimeoutError
    | ConnectionError
  >
>;
//# sourceMappingURL=evaluationsCreateEvaluationResult.d.ts.map
