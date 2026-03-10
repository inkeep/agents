import { InkeepAgentsCore } from '../core.js';
import { RequestOptions } from '../lib/sdks.js';
import {
  CreateDatasetItemsBulkRequest,
  CreateDatasetItemsBulkResponse,
} from '../models/createdatasetitemsbulkop.js';
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
export declare enum CreateDatasetItemsBulkAcceptEnum {
  applicationJsonAccept = 'application/json',
  applicationProblemPlusJsonAccept = 'application/problem+json',
}
/**
 * Create Multiple Dataset Items
 */
export declare function evaluationsCreateDatasetItemsBulk(
  client$: InkeepAgentsCore,
  request: CreateDatasetItemsBulkRequest,
  options?: RequestOptions
): APIPromise<
  Result<
    CreateDatasetItemsBulkResponse,
    | APIError
    | SDKValidationError
    | UnexpectedClientError
    | InvalidRequestError
    | RequestAbortedError
    | RequestTimeoutError
    | ConnectionError
  >
>;
//# sourceMappingURL=evaluationsCreateDatasetItemsBulk.d.ts.map
