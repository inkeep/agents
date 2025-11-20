import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { RemoveArtifactComponentFromAgentRequest, RemoveArtifactComponentFromAgentResponse } from "../models/removeartifactcomponentfromagentop.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
export declare enum RemoveArtifactComponentFromAgentAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Remove Artifact Component from Agent
 */
export declare function agentArtifactComponentRelationsRemoveArtifactComponentFromAgent(client$: InkeepAgentsCore, request: RemoveArtifactComponentFromAgentRequest, options?: RequestOptions): APIPromise<Result<RemoveArtifactComponentFromAgentResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=agentArtifactComponentRelationsRemoveArtifactComponentFromAgent.d.ts.map