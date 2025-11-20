import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { DeleteSubAgentTeamAgentRelationRequest, DeleteSubAgentTeamAgentRelationResponse } from "../models/deletesubagentteamagentrelationop.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
/**
 * Delete Sub Agent Team Agent Relation
 */
export declare function subAgentTeamAgentRelationsDeleteSubAgentTeamAgentRelation(client$: InkeepAgentsCore, request: DeleteSubAgentTeamAgentRelationRequest, options?: RequestOptions): APIPromise<Result<DeleteSubAgentTeamAgentRelationResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=subAgentTeamAgentRelationsDeleteSubAgentTeamAgentRelation.d.ts.map