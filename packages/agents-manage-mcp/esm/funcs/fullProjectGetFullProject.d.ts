import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { GetFullProjectRequest, GetFullProjectResponse } from "../models/getfullprojectop.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
export declare enum GetFullProjectAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Get Full Project
 *
 * @remarks
 * Retrieve a complete project definition with all Agents, Sub Agents, tools, and relationships
 */
export declare function fullProjectGetFullProject(client$: InkeepAgentsCore, request: GetFullProjectRequest, options?: RequestOptions): APIPromise<Result<GetFullProjectResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=fullProjectGetFullProject.d.ts.map