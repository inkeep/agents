import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { ListSubAgentTeamAgentRelationsRequest, ListSubAgentTeamAgentRelationsResponse } from "../models/listsubagentteamagentrelationsop.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
export declare enum ListSubAgentTeamAgentRelationsAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * List Sub Agent Team Agent Relations
 */
export declare function subAgentTeamAgentRelationsListSubAgentTeamAgentRelations(client$: InkeepAgentsCore, request: ListSubAgentTeamAgentRelationsRequest, options?: RequestOptions): APIPromise<Result<ListSubAgentTeamAgentRelationsResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=subAgentTeamAgentRelationsListSubAgentTeamAgentRelations.d.ts.map