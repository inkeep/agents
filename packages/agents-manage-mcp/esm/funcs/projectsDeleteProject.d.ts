import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { DeleteProjectRequest, DeleteProjectResponse } from "../models/deleteprojectop.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
export declare enum DeleteProjectAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Delete Project
 *
 * @remarks
 * Delete a project. Will fail if the project has existing resources.
 */
export declare function projectsDeleteProject(client$: InkeepAgentsCore, request: DeleteProjectRequest, options?: RequestOptions): APIPromise<Result<DeleteProjectResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=projectsDeleteProject.d.ts.map