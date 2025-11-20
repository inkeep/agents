import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { GetArtifactComponentsForAgentRequest, GetArtifactComponentsForAgentResponse } from "../models/getartifactcomponentsforagentop.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
export declare enum GetArtifactComponentsForAgentAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Get Artifact Components for Agent
 */
export declare function agentArtifactComponentRelationsGetArtifactComponentsForAgent(client$: InkeepAgentsCore, request: GetArtifactComponentsForAgentRequest, options?: RequestOptions): APIPromise<Result<GetArtifactComponentsForAgentResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=agentArtifactComponentRelationsGetArtifactComponentsForAgent.d.ts.map