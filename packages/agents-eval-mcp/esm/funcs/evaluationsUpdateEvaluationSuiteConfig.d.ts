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
  UpdateEvaluationSuiteConfigRequest,
  UpdateEvaluationSuiteConfigResponse,
} from '../models/updateevaluationsuiteconfigop.js';
import { APIPromise } from '../types/async.js';
import { Result } from '../types/fp.js';
export declare enum UpdateEvaluationSuiteConfigAcceptEnum {
  applicationJsonAccept = 'application/json',
  applicationProblemPlusJsonAccept = 'application/problem+json',
}
/**
 * Update Evaluation Suite Config
 */
export declare function evaluationsUpdateEvaluationSuiteConfig(
  client$: InkeepAgentsCore,
  request: UpdateEvaluationSuiteConfigRequest,
  options?: RequestOptions
): APIPromise<
  Result<
    UpdateEvaluationSuiteConfigResponse,
    | APIError
    | SDKValidationError
    | UnexpectedClientError
    | InvalidRequestError
    | RequestAbortedError
    | RequestTimeoutError
    | ConnectionError
  >
>;
//# sourceMappingURL=evaluationsUpdateEvaluationSuiteConfig.d.ts.map
