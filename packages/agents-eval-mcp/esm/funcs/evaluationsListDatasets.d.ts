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
import { ListDatasetsRequest, ListDatasetsResponse } from '../models/listdatasetsop.js';
import { APIPromise } from '../types/async.js';
import { Result } from '../types/fp.js';
export declare enum ListDatasetsAcceptEnum {
  applicationJsonAccept = 'application/json',
  applicationProblemPlusJsonAccept = 'application/problem+json',
}
/**
 * List Datasets
 */
export declare function evaluationsListDatasets(
  client$: InkeepAgentsCore,
  request: ListDatasetsRequest,
  options?: RequestOptions
): APIPromise<
  Result<
    ListDatasetsResponse,
    | APIError
    | SDKValidationError
    | UnexpectedClientError
    | InvalidRequestError
    | RequestAbortedError
    | RequestTimeoutError
    | ConnectionError
  >
>;
//# sourceMappingURL=evaluationsListDatasets.d.ts.map
