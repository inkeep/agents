import type { InkeepAgentsCore } from '../core.js';
import type { RequestOptions } from '../lib/sdks.js';
import { type CheckDataComponentAgentAssociationRequest, type CheckDataComponentAgentAssociationResponse } from '../models/checkdatacomponentagentassociationop.js';
import type { APIError } from '../models/errors/apierror.js';
import type { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from '../models/errors/httpclienterrors.js';
import type { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import { APIPromise } from '../types/async.js';
import type { Result } from '../types/fp.js';
export declare enum CheckDataComponentAgentAssociationAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Check if Data Component is Associated with Agent
 */
export declare function agentDataComponentRelationsCheckDataComponentAgentAssociation(client$: InkeepAgentsCore, request: CheckDataComponentAgentAssociationRequest, options?: RequestOptions): APIPromise<Result<CheckDataComponentAgentAssociationResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=agentDataComponentRelationsCheckDataComponentAgentAssociation.d.ts.map