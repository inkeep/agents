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
  GetEvaluationJobConfigRequest,
  GetEvaluationJobConfigResponse,
} from '../models/getevaluationjobconfigop.js';
import { APIPromise } from '../types/async.js';
import { Result } from '../types/fp.js';
export declare enum GetEvaluationJobConfigAcceptEnum {
  applicationJsonAccept = 'application/json',
  applicationProblemPlusJsonAccept = 'application/problem+json',
}
/**
 * Get Evaluation Job Config by ID
 */
export declare function evaluationsGetEvaluationJobConfig(
  client$: InkeepAgentsCore,
  request: GetEvaluationJobConfigRequest,
  options?: RequestOptions
): APIPromise<
  Result<
    GetEvaluationJobConfigResponse,
    | APIError
    | SDKValidationError
    | UnexpectedClientError
    | InvalidRequestError
    | RequestAbortedError
    | RequestTimeoutError
    | ConnectionError
  >
>;
//# sourceMappingURL=evaluationsGetEvaluationJobConfig.d.ts.map
