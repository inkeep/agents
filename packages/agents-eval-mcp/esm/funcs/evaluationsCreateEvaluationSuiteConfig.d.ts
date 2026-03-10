import { InkeepAgentsCore } from '../core.js';
import { RequestOptions } from '../lib/sdks.js';
import {
  CreateEvaluationSuiteConfigRequest,
  CreateEvaluationSuiteConfigResponse,
} from '../models/createevaluationsuiteconfigop.js';
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
export declare enum CreateEvaluationSuiteConfigAcceptEnum {
  applicationJsonAccept = 'application/json',
  applicationProblemPlusJsonAccept = 'application/problem+json',
}
/**
 * Create Evaluation Suite Config
 */
export declare function evaluationsCreateEvaluationSuiteConfig(
  client$: InkeepAgentsCore,
  request: CreateEvaluationSuiteConfigRequest,
  options?: RequestOptions
): APIPromise<
  Result<
    CreateEvaluationSuiteConfigResponse,
    | APIError
    | SDKValidationError
    | UnexpectedClientError
    | InvalidRequestError
    | RequestAbortedError
    | RequestTimeoutError
    | ConnectionError
  >
>;
//# sourceMappingURL=evaluationsCreateEvaluationSuiteConfig.d.ts.map
