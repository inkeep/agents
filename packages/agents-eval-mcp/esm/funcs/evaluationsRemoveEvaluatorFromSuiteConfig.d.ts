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
  RemoveEvaluatorFromSuiteConfigRequest,
  RemoveEvaluatorFromSuiteConfigResponse,
} from '../models/removeevaluatorfromsuiteconfigop.js';
import { APIPromise } from '../types/async.js';
import { Result } from '../types/fp.js';
/**
 * Remove Evaluator from Evaluation Suite Config
 */
export declare function evaluationsRemoveEvaluatorFromSuiteConfig(
  client$: InkeepAgentsCore,
  request: RemoveEvaluatorFromSuiteConfigRequest,
  options?: RequestOptions
): APIPromise<
  Result<
    RemoveEvaluatorFromSuiteConfigResponse,
    | APIError
    | SDKValidationError
    | UnexpectedClientError
    | InvalidRequestError
    | RequestAbortedError
    | RequestTimeoutError
    | ConnectionError
  >
>;
//# sourceMappingURL=evaluationsRemoveEvaluatorFromSuiteConfig.d.ts.map
