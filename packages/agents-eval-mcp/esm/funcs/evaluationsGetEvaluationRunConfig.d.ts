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
  GetEvaluationRunConfigRequest,
  GetEvaluationRunConfigResponse,
} from '../models/getevaluationrunconfigop.js';
import { APIPromise } from '../types/async.js';
import { Result } from '../types/fp.js';
export declare enum GetEvaluationRunConfigAcceptEnum {
  applicationJsonAccept = 'application/json',
  applicationProblemPlusJsonAccept = 'application/problem+json',
}
/**
 * Get Evaluation Run Config by ID
 */
export declare function evaluationsGetEvaluationRunConfig(
  client$: InkeepAgentsCore,
  request: GetEvaluationRunConfigRequest,
  options?: RequestOptions
): APIPromise<
  Result<
    GetEvaluationRunConfigResponse,
    | APIError
    | SDKValidationError
    | UnexpectedClientError
    | InvalidRequestError
    | RequestAbortedError
    | RequestTimeoutError
    | ConnectionError
  >
>;
//# sourceMappingURL=evaluationsGetEvaluationRunConfig.d.ts.map
