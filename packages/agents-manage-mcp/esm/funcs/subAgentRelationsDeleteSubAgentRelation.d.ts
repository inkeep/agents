import type { InkeepAgentsCore } from '../core.js';
import type { RequestOptions } from '../lib/sdks.js';
import { type DeleteSubAgentRelationRequest, type DeleteSubAgentRelationResponse } from '../models/deletesubagentrelationop.js';
import type { APIError } from '../models/errors/apierror.js';
import type { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from '../models/errors/httpclienterrors.js';
import type { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import { APIPromise } from '../types/async.js';
import type { Result } from '../types/fp.js';
/**
 * Delete Sub Agent Relation
 */
export declare function subAgentRelationsDeleteSubAgentRelation(client$: InkeepAgentsCore, request: DeleteSubAgentRelationRequest, options?: RequestOptions): APIPromise<Result<DeleteSubAgentRelationResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=subAgentRelationsDeleteSubAgentRelation.d.ts.map