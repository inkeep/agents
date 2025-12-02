import type { InkeepAgentsCore } from '../core.js';
import type { RequestOptions } from '../lib/sdks.js';
import { type DeleteSubAgentTeamAgentRelationRequest, type DeleteSubAgentTeamAgentRelationResponse } from '../models/deletesubagentteamagentrelationop.js';
import type { APIError } from '../models/errors/apierror.js';
import type { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from '../models/errors/httpclienterrors.js';
import type { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import { APIPromise } from '../types/async.js';
import type { Result } from '../types/fp.js';
/**
 * Delete Sub Agent Team Agent Relation
 */
export declare function subAgentTeamAgentRelationsDeleteSubAgentTeamAgentRelation(client$: InkeepAgentsCore, request: DeleteSubAgentTeamAgentRelationRequest, options?: RequestOptions): APIPromise<Result<DeleteSubAgentTeamAgentRelationResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=subAgentTeamAgentRelationsDeleteSubAgentTeamAgentRelation.d.ts.map