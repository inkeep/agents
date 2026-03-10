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
import { UpdateDatasetRequest, UpdateDatasetResponse } from '../models/updatedatasetop.js';
import { APIPromise } from '../types/async.js';
import { Result } from '../types/fp.js';
export declare enum UpdateDatasetAcceptEnum {
  applicationJsonAccept = 'application/json',
  applicationProblemPlusJsonAccept = 'application/problem+json',
}
/**
 * Update Dataset
 */
export declare function evaluationsUpdateDataset(
  client$: InkeepAgentsCore,
  request: UpdateDatasetRequest,
  options?: RequestOptions
): APIPromise<
  Result<
    UpdateDatasetResponse,
    | APIError
    | SDKValidationError
    | UnexpectedClientError
    | InvalidRequestError
    | RequestAbortedError
    | RequestTimeoutError
    | ConnectionError
  >
>;
//# sourceMappingURL=evaluationsUpdateDataset.d.ts.map
