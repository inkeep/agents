import type { InkeepAgentsCore } from '../core.js';
import type { RequestOptions } from '../lib/sdks.js';
import type { APIError } from '../models/errors/apierror.js';
import type { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from '../models/errors/httpclienterrors.js';
import type { SDKValidationError } from '../models/errors/sdkvalidationerror.js';
import { type ListMcpCatalogRequest, type ListMcpCatalogResponse } from '../models/listmcpcatalogop.js';
import { APIPromise } from '../types/async.js';
import type { Result } from '../types/fp.js';
export declare enum ListMcpCatalogAcceptEnum {
    applicationJsonAccept = "application/json",
    applicationProblemPlusJsonAccept = "application/problem+json"
}
/**
 * List MCP Server Catalog
 *
 * @remarks
 * Get a list of available prebuilt MCP servers. If COMPOSIO_API_KEY is configured, also includes Composio servers for the tenant/project.
 */
export declare function mcpCatalogListMCPCatalog(client$: InkeepAgentsCore, request: ListMcpCatalogRequest, options?: RequestOptions): APIPromise<Result<ListMcpCatalogResponse, APIError | SDKValidationError | UnexpectedClientError | InvalidRequestError | RequestAbortedError | RequestTimeoutError | ConnectionError>>;
//# sourceMappingURL=mcpCatalogListMCPCatalog.d.ts.map