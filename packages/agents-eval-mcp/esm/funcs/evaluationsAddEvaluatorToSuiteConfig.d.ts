import { InkeepAgentsCore } from '../core.js';
import { RequestOptions } from '../lib/sdks.js';
import {
  AddEvaluatorToSuiteConfigRequest,
  AddEvaluatorToSuiteConfigResponse,
} from '../models/addevaluatortosuiteconfigop.js';
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
export declare enum AddEvaluatorToSuiteConfigAcceptEnum {
  applicationJsonAccept = 'application/json',
  applicationProblemPlusJsonAccept = 'application/problem+json',
}
/**
 * Add Evaluator to Evaluation Suite Config
 */
export declare function evaluationsAddEvaluatorToSuiteConfig(
  client$: InkeepAgentsCore,
  request: AddEvaluatorToSuiteConfigRequest,
  options?: RequestOptions
): APIPromise<
  Result<
    AddEvaluatorToSuiteConfigResponse,
    | APIError
    | SDKValidationError
    | UnexpectedClientError
    | InvalidRequestError
    | RequestAbortedError
    | RequestTimeoutError
    | ConnectionError
  >
>;
//# sourceMappingURL=evaluationsAddEvaluatorToSuiteConfig.d.ts.map
