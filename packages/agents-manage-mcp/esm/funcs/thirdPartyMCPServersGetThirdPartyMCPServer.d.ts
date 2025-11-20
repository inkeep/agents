import { InkeepAgentsCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { APIError } from "../models/errors/apierror.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/errors/httpclienterrors.js";
import { SDKValidationError } from "../models/errors/sdkvalidationerror.js";
import { GetThirdPartyMcpServerRequest, GetThirdPartyMcpServerResponse } from "../models/getthirdpartymcpserverop.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
export declare enum GetThirdPartyMcpServerAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * Get Third-Party MCP Server Details
 *
 * @remarks
 * Fetch details for a specific third-party MCP server (e.g., Composio) including authentication status and connect URL
 */
export declare function thirdPartyMCPServersGetThirdPartyMCPServer(client$: InkeepAgentsCore, request: GetThirdPartyMcpServerRequest, options?: RequestOptions): APIPromise<Result<GetThirdPartyMcpServerResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=thirdPartyMCPServersGetThirdPartyMCPServer.d.ts.map