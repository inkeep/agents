import { InkeepAgentsCore } from '../core.js';
import { RequestOptions } from '../lib/sdks.js';
import {
  CreateDatasetItemRequest,
  CreateDatasetItemResponse,
} from '../models/createdatasetitemop.js';
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
export declare enum CreateDatasetItemAcceptEnum {
  applicationJsonAccept = 'application/json',
  applicationProblemPlusJsonAccept = 'application/problem+json',
}
/**
 * Create Dataset Item
 */
export declare function evaluationsCreateDatasetItem(
  client$: InkeepAgentsCore,
  request: CreateDatasetItemRequest,
  options?: RequestOptions
): APIPromise<
  Result<
    CreateDatasetItemResponse,
    | APIError
    | SDKValidationError
    | UnexpectedClientError
    | InvalidRequestError
    | RequestAbortedError
    | RequestTimeoutError
    | ConnectionError
  >
>;
//# sourceMappingURL=evaluationsCreateDatasetItem.d.ts.map
