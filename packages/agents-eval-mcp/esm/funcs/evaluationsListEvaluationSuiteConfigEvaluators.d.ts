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
  ListEvaluationSuiteConfigEvaluatorsRequest,
  ListEvaluationSuiteConfigEvaluatorsResponse,
} from '../models/listevaluationsuiteconfigevaluatorsop.js';
import { APIPromise } from '../types/async.js';
import { Result } from '../types/fp.js';
export declare enum ListEvaluationSuiteConfigEvaluatorsAcceptEnum {
  applicationJsonAccept = 'application/json',
  applicationProblemPlusJsonAccept = 'application/problem+json',
}
/**
 * List Evaluators for Evaluation Suite Config
 */
export declare function evaluationsListEvaluationSuiteConfigEvaluators(
  client$: InkeepAgentsCore,
  request: ListEvaluationSuiteConfigEvaluatorsRequest,
  options?: RequestOptions
): APIPromise<
  Result<
    ListEvaluationSuiteConfigEvaluatorsResponse,
    | APIError
    | SDKValidationError
    | UnexpectedClientError
    | InvalidRequestError
    | RequestAbortedError
    | RequestTimeoutError
    | ConnectionError
  >
>;
//# sourceMappingURL=evaluationsListEvaluationSuiteConfigEvaluators.d.ts.map
