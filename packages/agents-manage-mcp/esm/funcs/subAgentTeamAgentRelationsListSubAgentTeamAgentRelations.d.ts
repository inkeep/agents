import type { InkeepAgentsCore } from '../core.js';
import type { RequestOptions } from '../lib/sdks.js';
import type { APIError } from '../models/errors/apierror.js';
import type { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from '../models/errors/httpclienterrors.js';
import type { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import { type ListSubAgentTeamAgentRelationsRequest, type ListSubAgentTeamAgentRelationsResponse } from '../models/listsubagentteamagentrelationsop.js';
import { APIPromise } from '../types/async.js';
import type { Result } from '../types/fp.js';
export declare enum ListSubAgentTeamAgentRelationsAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * List Sub Agent Team Agent Relations
 */
export declare function subAgentTeamAgentRelationsListSubAgentTeamAgentRelations(client$: InkeepAgentsCore, request: ListSubAgentTeamAgentRelationsRequest, options?: RequestOptions): APIPromise<Result<ListSubAgentTeamAgentRelationsResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=subAgentTeamAgentRelationsListSubAgentTeamAgentRelations.d.ts.map