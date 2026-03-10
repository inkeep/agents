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
  UpdateDatasetItemRequest,
  UpdateDatasetItemResponse,
} from '../models/updatedatasetitemop.js';
import { APIPromise } from '../types/async.js';
import { Result } from '../types/fp.js';
export declare enum UpdateDatasetItemAcceptEnum {
  applicationJsonAccept = 'application/json',
  applicationProblemPlusJsonAccept = 'application/problem+json',
}
/**
 * Update Dataset Item
 */
export declare function evaluationsUpdateDatasetItem(
  client$: InkeepAgentsCore,
  request: UpdateDatasetItemRequest,
  options?: RequestOptions
): APIPromise<
  Result<
    UpdateDatasetItemResponse,
    | APIError
    | SDKValidationError
    | UnexpectedClientError
    | InvalidRequestError
    | RequestAbortedError
    | RequestTimeoutError
    | ConnectionError
  >
>;
//# sourceMappingURL=evaluationsUpdateDatasetItem.d.ts.map
