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
import { ListEvaluatorsRequest, ListEvaluatorsResponse } from '../models/listevaluatorsop.js';
import { APIPromise } from '../types/async.js';
import { Result } from '../types/fp.js';
export declare enum ListEvaluatorsAcceptEnum {
  applicationJsonAccept = 'application/json',
  applicationProblemPlusJsonAccept = 'application/problem+json',
}
/**
 * List Evaluators
 */
export declare function evaluationsListEvaluators(
  client$: InkeepAgentsCore,
  request: ListEvaluatorsRequest,
  options?: RequestOptions
): APIPromise<
  Result<
    ListEvaluatorsResponse,
    | APIError
    | SDKValidationError
    | UnexpectedClientError
    | InvalidRequestError
    | RequestAbortedError
    | RequestTimeoutError
    | ConnectionError
  >
>;
//# sourceMappingURL=evaluationsListEvaluators.d.ts.map
