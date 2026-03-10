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
  ListDatasetRunConfigsRequest,
  ListDatasetRunConfigsResponse,
} from '../models/listdatasetrunconfigsop.js';
import { APIPromise } from '../types/async.js';
import { Result } from '../types/fp.js';
export declare enum ListDatasetRunConfigsAcceptEnum {
  applicationJsonAccept = 'application/json',
  applicationProblemPlusJsonAccept = 'application/problem+json',
}
/**
 * List Dataset Run Configs
 */
export declare function evaluationsListDatasetRunConfigs(
  client$: InkeepAgentsCore,
  request: ListDatasetRunConfigsRequest,
  options?: RequestOptions
): APIPromise<
  Result<
    ListDatasetRunConfigsResponse,
    | APIError
    | SDKValidationError
    | UnexpectedClientError
    | InvalidRequestError
    | RequestAbortedError
    | RequestTimeoutError
    | ConnectionError
  >
>;
//# sourceMappingURL=evaluationsListDatasetRunConfigs.d.ts.map
