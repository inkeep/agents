import type { InkeepAgentsCore } from '../core.js';
import type { RequestOptions } from '../lib/sdks.js';
import { type DeleteExternalAgentRequest, type DeleteExternalAgentResponse } from '../models/deleteexternalagentop.js';
import type { APIError } from '../models/errors/apierror.js';
import type { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from '../models/errors/httpclienterrors.js';
import type { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import { APIPromise } from '../types/async.js';
import type { Result } from '../types/fp.js';
/**
 * Delete External Agent
 */
export declare function externalAgentsDeleteExternalAgent(client$: InkeepAgentsCore, request: DeleteExternalAgentRequest, options?: RequestOptions): APIPromise<Result<DeleteExternalAgentResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=externalAgentsDeleteExternalAgent.d.ts.map