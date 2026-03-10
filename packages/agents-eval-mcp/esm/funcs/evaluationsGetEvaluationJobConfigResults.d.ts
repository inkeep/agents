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
  GetEvaluationJobConfigResultsRequest,
  GetEvaluationJobConfigResultsResponse,
} from '../models/getevaluationjobconfigresultsop.js';
import { APIPromise } from '../types/async.js';
import { Result } from '../types/fp.js';
export declare enum GetEvaluationJobConfigResultsAcceptEnum {
  applicationJsonAccept = 'application/json',
  applicationProblemPlusJsonAccept = 'application/problem+json',
}
/**
 * Get Evaluation Results by Job Config ID
 */
export declare function evaluationsGetEvaluationJobConfigResults(
  client$: InkeepAgentsCore,
  request: GetEvaluationJobConfigResultsRequest,
  options?: RequestOptions
): APIPromise<
  Result<
    GetEvaluationJobConfigResultsResponse,
    | APIError
    | SDKValidationError
    | UnexpectedClientError
    | InvalidRequestError
    | RequestAbortedError
    | RequestTimeoutError
    | ConnectionError
  >
>;
//# sourceMappingURL=evaluationsGetEvaluationJobConfigResults.d.ts.map
