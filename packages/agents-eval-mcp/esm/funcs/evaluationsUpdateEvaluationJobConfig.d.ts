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
  UpdateEvaluationJobConfigRequest,
  UpdateEvaluationJobConfigResponse,
} from '../models/updateevaluationjobconfigop.js';
import { APIPromise } from '../types/async.js';
import { Result } from '../types/fp.js';
export declare enum UpdateEvaluationJobConfigAcceptEnum {
  applicationJsonAccept = 'application/json',
  applicationProblemPlusJsonAccept = 'application/problem+json',
}
/**
 * Update Evaluation Job Config
 */
export declare function evaluationsUpdateEvaluationJobConfig(
  client$: InkeepAgentsCore,
  request: UpdateEvaluationJobConfigRequest,
  options?: RequestOptions
): APIPromise<
  Result<
    UpdateEvaluationJobConfigResponse,
    | APIError
    | SDKValidationError
    | UnexpectedClientError
    | InvalidRequestError
    | RequestAbortedError
    | RequestTimeoutError
    | ConnectionError
  >
>;
//# sourceMappingURL=evaluationsUpdateEvaluationJobConfig.d.ts.map
