import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { AssociateDataComponentWithAgentRequest, AssociateDataComponentWithAgentResponse } from "../models/associatedatacomponentwithagentop.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
export declare enum AssociateDataComponentWithAgentAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Associate Data Component with Agent
 */
export declare function agentDataComponentRelationsAssociateDataComponentWithAgent(client$: InkeepAgentsCore, request: AssociateDataComponentWithAgentRequest, options?: RequestOptions): APIPromise<Result<AssociateDataComponentWithAgentResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=agentDataComponentRelationsAssociateDataComponentWithAgent.d.ts.map