import { InkeepAgentsCore } from '../core.js';
import { RequestOptions } from '../lib/sdks.js';
import {
  CreateEvaluationJobConfigRequest,
  CreateEvaluationJobConfigResponse,
} from '../models/createevaluationjobconfigop.js';
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
export declare enum CreateEvaluationJobConfigAcceptEnum {
  applicationJsonAccept = 'application/json',
  applicationProblemPlusJsonAccept = 'application/problem+json',
}
/**
 * Create Evaluation Job Config
 */
export declare function evaluationsCreateEvaluationJobConfig(
  client$: InkeepAgentsCore,
  request: CreateEvaluationJobConfigRequest,
  options?: RequestOptions
): APIPromise<
  Result<
    CreateEvaluationJobConfigResponse,
    | APIError
    | SDKValidationError
    | UnexpectedClientError
    | InvalidRequestError
    | RequestAbortedError
    | RequestTimeoutError
    | ConnectionError
  >
>;
//# sourceMappingURL=evaluationsCreateEvaluationJobConfig.d.ts.map
