import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { GetPromptResult, ServerNotification, ServerRequest } from '@modelcontextprotocol/sdk/types.js';
import type { objectOutputType, ZodOptional, ZodType, ZodTypeAny, ZodTypeDef } from 'zod';
import type { InkeepAgentsCore } from '../core.js';
import type { ConsoleLogger } from './console-logger.js';
import type { MCPScope } from './scopes.js';
export type PromptArgsRawShape = {
    [k: string]: ZodType<string, ZodTypeDef, string> | ZodOptional<ZodType<string, ZodTypeDef, string>>;
};
export type PromptDefinition<Args extends undefined | PromptArgsRawShape = undefined> = Args extends PromptArgsRawShape ? {
    name: string;
    description?: string;
    scopes?: MCPScope[];
    args: Args;
    prompt: (client: InkeepAgentsCore, args: objectOutputType<Args, ZodTypeAny>, extra: RequestHandlerExtra<ServerRequest, ServerNotification>) => GetPromptResult | Promise<GetPromptResult>;
} : {
    name: string;
    description?: string;
    scopes?: MCPScope[];
    args?: undefined;
    prompt: (client: InkeepAgentsCore, extra: RequestHandlerExtra<ServerRequest, ServerNotification>) => GetPromptResult | Promise<GetPromptResult>;
};
export declare function formatResult(value: string): Promise<GetPromptResult>;
export declare function createRegisterPrompt(logger: ConsoleLogger, server: McpServer, getSDK: () => InkeepAgentsCore, allowedScopes: Set<MCPScope>): <A extends PromptArgsRawShape | undefined>(prompt: PromptDefinition<A>) => void;
//# sourceMappingURL=prompts.d.ts.map