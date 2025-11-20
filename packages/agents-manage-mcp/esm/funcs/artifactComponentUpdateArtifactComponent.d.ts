import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { UpdateArtifactComponentRequest, UpdateArtifactComponentResponse } from "../models/updateartifactcomponentop.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
export declare enum UpdateArtifactComponentAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Update Artifact Component
 */
export declare function artifactComponentUpdateArtifactComponent(client$: InkeepAgentsCore, request: UpdateArtifactComponentRequest, options?: RequestOptions): APIPromise<Result<UpdateArtifactComponentResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=artifactComponentUpdateArtifactComponent.d.ts.map