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
  ListEvaluationRunConfigsRequest,
  ListEvaluationRunConfigsResponse,
} from '../models/listevaluationrunconfigsop.js';
import { APIPromise } from '../types/async.js';
import { Result } from '../types/fp.js';
export declare enum ListEvaluationRunConfigsAcceptEnum {
  applicationJsonAccept = 'application/json',
  applicationProblemPlusJsonAccept = 'application/problem+json',
}
/**
 * List Evaluation Run Configs
 */
export declare function evaluationsListEvaluationRunConfigs(
  client$: InkeepAgentsCore,
  request: ListEvaluationRunConfigsRequest,
  options?: RequestOptions
): APIPromise<
  Result<
    ListEvaluationRunConfigsResponse,
    | APIError
    | SDKValidationError
    | UnexpectedClientError
    | InvalidRequestError
    | RequestAbortedError
    | RequestTimeoutError
    | ConnectionError
  >
>;
//# sourceMappingURL=evaluationsListEvaluationRunConfigs.d.ts.map
