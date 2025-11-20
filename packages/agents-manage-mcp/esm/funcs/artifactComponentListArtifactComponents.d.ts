import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { ListArtifactComponentsRequest, ListArtifactComponentsResponse } from "../models/listartifactcomponentsop.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
export declare enum ListArtifactComponentsAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * List Artifact Components
 */
export declare function artifactComponentListArtifactComponents(client$: InkeepAgentsCore, request: ListArtifactComponentsRequest, options?: RequestOptions): APIPromise<Result<ListArtifactComponentsResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=artifactComponentListArtifactComponents.d.ts.map