import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { UpdateFullProjectRequest, UpdateFullProjectResponse } from "../models/updatefullprojectop.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
export declare enum UpdateFullProjectAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Update Full Project
 *
 * @remarks
 * Update or create a complete project with all Agents, Sub Agents, tools, and relationships from JSON definition
 */
export declare function fullProjectUpdateFullProject(client$: InkeepAgentsCore, request: UpdateFullProjectRequest, options?: RequestOptions): APIPromise<Result<UpdateFullProjectResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=fullProjectUpdateFullProject.d.ts.map