import { InkeepAgentsCore } from '../core.js';
import { RequestOptions } from '../lib/sdks.js';
import {
  CreateEvaluationRunConfigRequest,
  CreateEvaluationRunConfigResponse,
} from '../models/createevaluationrunconfigop.js';
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
export declare enum CreateEvaluationRunConfigAcceptEnum {
  applicationJsonAccept = 'application/json',
  applicationProblemPlusJsonAccept = 'application/problem+json',
}
/**
 * Create Evaluation Run Config
 */
export declare function evaluationsCreateEvaluationRunConfig(
  client$: InkeepAgentsCore,
  request: CreateEvaluationRunConfigRequest,
  options?: RequestOptions
): APIPromise<
  Result<
    CreateEvaluationRunConfigResponse,
    | APIError
    | SDKValidationError
    | UnexpectedClientError
    | InvalidRequestError
    | RequestAbortedError
    | RequestTimeoutError
    | ConnectionError
  >
>;
//# sourceMappingURL=evaluationsCreateEvaluationRunConfig.d.ts.map
