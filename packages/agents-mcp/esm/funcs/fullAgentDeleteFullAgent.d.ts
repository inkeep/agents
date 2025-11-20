import type { InkeepAgentsCore } from '../core.js';
import type { RequestOptions } from '../lib/sdks.js';
import { type DeleteFullAgentRequest, type DeleteFullAgentResponse } from '../models/deletefullagentop.js';
import type { APIError } from '../models/errors/apierror.js';
import type { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from '../models/errors/httpclienterrors.js';
import type { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import { APIPromise } from '../types/async.js';
import type { Result } from '../types/fp.js';
/**
 * Delete Full Agent
 *
 * @remarks
 * Delete a complete agent and cascade to all related entities (relationships, not other agents/tools)
 */
export declare function fullAgentDeleteFullAgent(client$: InkeepAgentsCore, request: DeleteFullAgentRequest, options?: RequestOptions): APIPromise<Result<DeleteFullAgentResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=fullAgentDeleteFullAgent.d.ts.map