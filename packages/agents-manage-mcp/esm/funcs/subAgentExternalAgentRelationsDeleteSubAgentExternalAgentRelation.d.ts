import type { InkeepAgentsCore } from '../core.js';
import type { RequestOptions } from '../lib/sdks.js';
import { type DeleteSubAgentExternalAgentRelationRequest, type DeleteSubAgentExternalAgentRelationResponse } from '../models/deletesubagentexternalagentrelationop.js';
import type { APIError } from '../models/errors/apierror.js';
import type { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from '../models/errors/httpclienterrors.js';
import type { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import { APIPromise } from '../types/async.js';
import type { Result } from '../types/fp.js';
/**
 * Delete Sub Agent External Agent Relation
 */
export declare function subAgentExternalAgentRelationsDeleteSubAgentExternalAgentRelation(client$: InkeepAgentsCore, request: DeleteSubAgentExternalAgentRelationRequest, options?: RequestOptions): APIPromise<Result<DeleteSubAgentExternalAgentRelationResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=subAgentExternalAgentRelationsDeleteSubAgentExternalAgentRelation.d.ts.map