import type { InkeepAgentsCore } from '../core.js';
import type { RequestOptions } from '../lib/sdks.js';
import { type AssociateDataComponentWithAgentRequest, type AssociateDataComponentWithAgentResponse } from '../models/associatedatacomponentwithagentop.js';
import type { APIError } from '../models/errors/apierror.js';
import type { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from '../models/errors/httpclienterrors.js';
import type { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import { APIPromise } from '../types/async.js';
import type { Result } from '../types/fp.js';
export declare enum AssociateDataComponentWithAgentAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Associate Data Component with Agent
 */
export declare function agentDataComponentRelationsAssociateDataComponentWithAgent(client$: InkeepAgentsCore, request: AssociateDataComponentWithAgentRequest, options?: RequestOptions): APIPromise<Result<AssociateDataComponentWithAgentResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=agentDataComponentRelationsAssociateDataComponentWithAgent.d.ts.map