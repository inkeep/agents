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
import { ListDatasetRunsRequest, ListDatasetRunsResponse } from '../models/listdatasetrunsop.js';
import { APIPromise } from '../types/async.js';
import { Result } from '../types/fp.js';
export declare enum ListDatasetRunsAcceptEnum {
  applicationJsonAccept = 'application/json',
  applicationProblemPlusJsonAccept = 'application/problem+json',
}
/**
 * List Dataset Runs
 */
export declare function evaluationsListDatasetRuns(
  client$: InkeepAgentsCore,
  request: ListDatasetRunsRequest,
  options?: RequestOptions
): APIPromise<
  Result<
    ListDatasetRunsResponse,
    | APIError
    | SDKValidationError
    | UnexpectedClientError
    | InvalidRequestError
    | RequestAbortedError
    | RequestTimeoutError
    | ConnectionError
  >
>;
//# sourceMappingURL=evaluationsListDatasetRuns.d.ts.map
