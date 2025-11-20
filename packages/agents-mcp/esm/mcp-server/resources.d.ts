import type { McpServer, ResourceMetadata, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { Variables } from '@modelcontextprotocol/sdk/shared/uriTemplate.js';
import type { ReadResourceResult, ServerNotification, ServerRequest } from '@modelcontextprotocol/sdk/types.js';
import type { InkeepAgentsCore } from '../core.js';
import type { ConsoleLogger } from './console-logger.js';
import type { MCPScope } from './scopes.js';
export type ReadResourceCallback = (client: InkeepAgentsCore, uri: URL, extra: RequestHandlerExtra<ServerRequest, ServerNotification>) => ReadResourceResult | Promise<ReadResourceResult>;
export type ResourceDefinition = {
    name: string;
    description?: string;
    metadata?: ResourceMetadata;
    scopes?: MCPScope[];
    resource: string;
    read: ReadResourceCallback;
};
export type ReadResourceTemplateCallback = (client: InkeepAgentsCore, uri: URL, vars: Variables, extra: RequestHandlerExtra<ServerRequest, ServerNotification>) => ReadResourceResult | Promise<ReadResourceResult>;
export type ResourceTemplateDefinition = {
    name: string;
    description: string;
    metadata?: ResourceMetadata;
    scopes?: MCPScope[];
    resource: ResourceTemplate;
    read: ReadResourceTemplateCallback;
};
export declare function formatResult(value: unknown, uri: URL, init: {
    mimeType?: string | undefined;
    response?: Response | undefined;
}): Promise<ReadResourceResult>;
export declare function createRegisterResource(logger: ConsoleLogger, server: McpServer, getSDK: () => InkeepAgentsCore, allowedScopes: Set<MCPScope>): (resource: ResourceDefinition) => void;
export declare function createRegisterResourceTemplate(logger: ConsoleLogger, server: McpServer, getSDK: () => InkeepAgentsCore, allowedScopes: Set<MCPScope>): (resource: ResourceTemplateDefinition) => void;
//# sourceMappingURL=resources.d.ts.map