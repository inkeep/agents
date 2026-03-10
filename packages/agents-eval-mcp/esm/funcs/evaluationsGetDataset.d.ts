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
import { GetDatasetRequest, GetDatasetResponse } from '../models/getdatasetop.js';
import { APIPromise } from '../types/async.js';
import { Result } from '../types/fp.js';
export declare enum GetDatasetAcceptEnum {
  applicationJsonAccept = 'application/json',
  applicationProblemPlusJsonAccept = 'application/problem+json',
}
/**
 * Get Dataset by ID
 */
export declare function evaluationsGetDataset(
  client$: InkeepAgentsCore,
  request: GetDatasetRequest,
  options?: RequestOptions
): APIPromise<
  Result<
    GetDatasetResponse,
    | APIError
    | SDKValidationError
    | UnexpectedClientError
    | InvalidRequestError
    | RequestAbortedError
    | RequestTimeoutError
    | ConnectionError
  >
>;
//# sourceMappingURL=evaluationsGetDataset.d.ts.map
