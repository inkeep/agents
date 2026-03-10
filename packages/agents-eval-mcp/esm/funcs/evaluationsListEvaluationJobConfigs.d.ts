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
  ListEvaluationJobConfigsRequest,
  ListEvaluationJobConfigsResponse,
} from '../models/listevaluationjobconfigsop.js';
import { APIPromise } from '../types/async.js';
import { Result } from '../types/fp.js';
export declare enum ListEvaluationJobConfigsAcceptEnum {
  applicationJsonAccept = 'application/json',
  applicationProblemPlusJsonAccept = 'application/problem+json',
}
/**
 * List Evaluation Job Configs
 */
export declare function evaluationsListEvaluationJobConfigs(
  client$: InkeepAgentsCore,
  request: ListEvaluationJobConfigsRequest,
  options?: RequestOptions
): APIPromise<
  Result<
    ListEvaluationJobConfigsResponse,
    | APIError
    | SDKValidationError
    | UnexpectedClientError
    | InvalidRequestError
    | RequestAbortedError
    | RequestTimeoutError
    | ConnectionError
  >
>;
//# sourceMappingURL=evaluationsListEvaluationJobConfigs.d.ts.map
