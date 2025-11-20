import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { AssociateArtifactComponentWithAgentRequest, AssociateArtifactComponentWithAgentResponse } from "../models/associateartifactcomponentwithagentop.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
export declare enum AssociateArtifactComponentWithAgentAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Associate Artifact Component with Agent
 */
export declare function agentArtifactComponentRelationsAssociateArtifactComponentWithAgent(client$: InkeepAgentsCore, request: AssociateArtifactComponentWithAgentRequest, options?: RequestOptions): APIPromise<Result<AssociateArtifactComponentWithAgentResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=agentArtifactComponentRelationsAssociateArtifactComponentWithAgent.d.ts.map