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
  GetEvaluationRunConfigResultsRequest,
  GetEvaluationRunConfigResultsResponse,
} from '../models/getevaluationrunconfigresultsop.js';
import { APIPromise } from '../types/async.js';
import { Result } from '../types/fp.js';
export declare enum GetEvaluationRunConfigResultsAcceptEnum {
  applicationJsonAccept = 'application/json',
  applicationProblemPlusJsonAccept = 'application/problem+json',
}
/**
 * Get Evaluation Results by Run Config ID
 */
export declare function evaluationsGetEvaluationRunConfigResults(
  client$: InkeepAgentsCore,
  request: GetEvaluationRunConfigResultsRequest,
  options?: RequestOptions
): APIPromise<
  Result<
    GetEvaluationRunConfigResultsResponse,
    | APIError
    | SDKValidationError
    | UnexpectedClientError
    | InvalidRequestError
    | RequestAbortedError
    | RequestTimeoutError
    | ConnectionError
  >
>;
//# sourceMappingURL=evaluationsGetEvaluationRunConfigResults.d.ts.map
