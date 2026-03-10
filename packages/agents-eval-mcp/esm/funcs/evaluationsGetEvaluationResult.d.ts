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
import {
  GetEvaluationResultRequest,
  GetEvaluationResultResponse,
} from '../models/getevaluationresultop.js';
import { APIPromise } from '../types/async.js';
import { Result } from '../types/fp.js';
export declare enum GetEvaluationResultAcceptEnum {
  applicationJsonAccept = 'application/json',
  applicationProblemPlusJsonAccept = 'application/problem+json',
}
/**
 * Get Evaluation Result by ID
 */
export declare function evaluationsGetEvaluationResult(
  client$: InkeepAgentsCore,
  request: GetEvaluationResultRequest,
  options?: RequestOptions
): APIPromise<
  Result<
    GetEvaluationResultResponse,
    | APIError
    | SDKValidationError
    | UnexpectedClientError
    | InvalidRequestError
    | RequestAbortedError
    | RequestTimeoutError
    | ConnectionError
  >
>;
//# sourceMappingURL=evaluationsGetEvaluationResult.d.ts.map
