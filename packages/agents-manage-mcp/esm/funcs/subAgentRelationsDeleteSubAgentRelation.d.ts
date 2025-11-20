import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { DeleteSubAgentRelationRequest, DeleteSubAgentRelationResponse } from "../models/deletesubagentrelationop.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
/**
 * Delete Sub Agent Relation
 */
export declare function subAgentRelationsDeleteSubAgentRelation(client$: InkeepAgentsCore, request: DeleteSubAgentRelationRequest, options?: RequestOptions): APIPromise<Result<DeleteSubAgentRelationResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=subAgentRelationsDeleteSubAgentRelation.d.ts.map