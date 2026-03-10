import { InkeepAgentsCore } from '../core.js';
import { RequestOptions } from '../lib/sdks.js';
import {
  DeleteEvaluationRunConfigRequest,
  DeleteEvaluationRunConfigResponse,
} from '../models/deleteevaluationrunconfigop.js';
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
/**
 * Delete Evaluation Run Config
 */
export declare function evaluationsDeleteEvaluationRunConfig(
  client$: InkeepAgentsCore,
  request: DeleteEvaluationRunConfigRequest,
  options?: RequestOptions
): APIPromise<
  Result<
    DeleteEvaluationRunConfigResponse,
    | APIError
    | SDKValidationError
    | UnexpectedClientError
    | InvalidRequestError
    | RequestAbortedError
    | RequestTimeoutError
    | ConnectionError
  >
>;
//# sourceMappingURL=evaluationsDeleteEvaluationRunConfig.d.ts.map
