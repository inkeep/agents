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
  UpdateEvaluationRunConfigRequest,
  UpdateEvaluationRunConfigResponse,
} from '../models/updateevaluationrunconfigop.js';
import { APIPromise } from '../types/async.js';
import { Result } from '../types/fp.js';
export declare enum UpdateEvaluationRunConfigAcceptEnum {
  applicationJsonAccept = 'application/json',
  applicationProblemPlusJsonAccept = 'application/problem+json',
}
/**
 * Update Evaluation Run Config
 */
export declare function evaluationsUpdateEvaluationRunConfig(
  client$: InkeepAgentsCore,
  request: UpdateEvaluationRunConfigRequest,
  options?: RequestOptions
): APIPromise<
  Result<
    UpdateEvaluationRunConfigResponse,
    | APIError
    | SDKValidationError
    | UnexpectedClientError
    | InvalidRequestError
    | RequestAbortedError
    | RequestTimeoutError
    | ConnectionError
  >
>;
//# sourceMappingURL=evaluationsUpdateEvaluationRunConfig.d.ts.map
