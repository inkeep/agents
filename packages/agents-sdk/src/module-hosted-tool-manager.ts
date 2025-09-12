import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getLogger } from "@inkeep/agents-core";

const logger = getLogger("module-hosted-tool-manager");

export interface InlineToolFunction {
	name: string;
	description?: string;
	execute: (params: any) => Promise<any>;
	parameters?: Record<string, any>;
}

export interface ModuleHostedToolServer {
	toolFunction: InlineToolFunction;
	process?: ChildProcess;
	port: number;
	serverUrl: string;
	status: "starting" | "running" | "stopped" | "error";
	pid?: number;
	moduleFile: string;
}

export class ModuleHostedToolManager {
	private servers = new Map<string, ModuleHostedToolServer>();
	private portCounter = 3011;
	private readonly baseDir: string;
	private toolModules = new Map<string, InlineToolFunction>();

	constructor() {
		this.baseDir = join(process.cwd(), ".hosted-tools");
		if (!existsSync(this.baseDir)) {
			mkdirSync(this.baseDir, { recursive: true });
		}
	}

	async deployInlineTool(
		toolFunction: InlineToolFunction,
	): Promise<ModuleHostedToolServer> {
		const toolId = this.getToolId(toolFunction.name);

		// Check if tool is already deployed
		if (this.servers.has(toolId)) {
			const existingServer = this.servers.get(toolId);
			if (existingServer?.status === "running") {
				logger.info({ toolId }, "Inline tool already deployed and running");
				return existingServer;
			}
		}

		const port = this.getNextPort();
		const serverUrl = `http://localhost:${port}/mcp`;

		// Store the tool function in our registry
		this.toolModules.set(toolId, toolFunction);

		const server: ModuleHostedToolServer = {
			toolFunction,
			port,
			serverUrl,
			status: "starting",
			moduleFile: "",
		};

		this.servers.set(toolId, server);

		try {
			await this.generateModuleFiles(server);
			await this.startServer(server);

			// Wait for server to be ready
			await this.waitForServerReady(server);

			server.status = "running";
			logger.info(
				{ toolId, port, serverUrl },
				"Inline tool deployed successfully",
			);

			return server;
		} catch (error) {
			server.status = "error";
			logger.error(
				{
					toolId,
					error: error instanceof Error ? error.message : "Unknown error",
				},
				"Failed to deploy inline tool",
			);
			throw error;
		}
	}

	async stopTool(toolName: string): Promise<void> {
		const toolId = this.getToolId(toolName);
		const server = this.servers.get(toolId);

		if (!server || !server.process) {
			logger.warn({ toolId }, "Inline tool not found or not running");
			return;
		}

		return new Promise((resolve) => {
			server.process?.on("exit", () => {
				server.status = "stopped";
				server.process = undefined;
				server.pid = undefined;
				// Clean up the module registry
				this.toolModules.delete(toolId);
				logger.info({ toolId }, "Inline tool stopped successfully");
				resolve();
			});

			server.process?.kill("SIGTERM");

			// Force kill after 5 seconds
			setTimeout(() => {
				if (server.process && !server.process.killed) {
					server.process.kill("SIGKILL");
				}
			}, 5000);
		});
	}

	getServer(toolName: string): ModuleHostedToolServer | undefined {
		const toolId = this.getToolId(toolName);
		return this.servers.get(toolId);
	}

	getAllServers(): ModuleHostedToolServer[] {
		return Array.from(this.servers.values());
	}

	private getToolId(name: string): string {
		return name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "");
	}

	private getNextPort(): number {
		return this.portCounter++;
	}

	private async generateModuleFiles(
		server: ModuleHostedToolServer,
	): Promise<void> {
		const toolId = this.getToolId(server.toolFunction.name);
		const serverDir = join(this.baseDir, toolId);

		if (!existsSync(serverDir)) {
			mkdirSync(serverDir, { recursive: true });
		}

		// Create a separate module file for the tool function
		const toolModuleFile = join(serverDir, "tool-function.mjs");
		const toolModuleCode = this.createToolModule(server.toolFunction);
		writeFileSync(toolModuleFile, toolModuleCode, "utf8");

		// Create the MCP server file that imports the tool module
		const serverFile = join(serverDir, "server.mjs");
		const serverCode = this.createMCPServerCode(server, toolId);
		writeFileSync(serverFile, serverCode, "utf8");

		server.moduleFile = serverFile;

		// Create package.json for the tool server
		const packageJson = {
			name: `hosted-tool-${toolId}`,
			version: "1.0.0",
			type: "module",
			main: "server.mjs",
			dependencies: {
				"@modelcontextprotocol/sdk": "^1.12.1",
				zod: "^3.25.31",
			},
		};

		writeFileSync(
			join(serverDir, "package.json"),
			JSON.stringify(packageJson, null, 2),
			"utf8",
		);

		logger.info(
			{ toolId, serverFile, toolModuleFile },
			"Generated module-based MCP server code",
		);
	}

	private createToolModule(toolFunction: InlineToolFunction): string {
		// Extract the function body without serializing to string
		// We'll use a different approach - create a module that exports the function
		return `// Auto-generated tool function module
export const toolName = '${toolFunction.name}';
export const toolDescription = '${toolFunction.description || ""}';

// Re-export the tool function
// Note: This approach requires the function to be passed through a registry
export async function execute(params) {
    // This will be resolved at runtime through the parent process communication
    const result = await parentProcessExecute(params);
    return result;
}

// Parameters schema (if provided)
export const parameters = ${toolFunction.parameters ? JSON.stringify(toolFunction.parameters, null, 2) : "undefined"};
`;
	}

	private createMCPServerCode(
		server: ModuleHostedToolServer,
		toolId: string,
	): string {
		return `#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp';
import { z } from 'zod';
import { createServer } from 'node:http';

const server = new McpServer({
    name: '${server.toolFunction.name}',
    version: '1.0.0',
}, { capabilities: { logging: {} } });

// Parameter schema
const parameterSchema = z.object({${
			server.toolFunction.parameters
				? `${Object.keys(server.toolFunction.parameters)
						.map((key) => `\n    ${key}: z.any()`)
						.join(",")}\n`
				: ""
		}});

// Communication with parent process for function execution
let parentProcess = null;

// Set up IPC communication
process.on('message', (message) => {
    if (message.type === 'function-result') {
        // Handle function execution result
        const { requestId, result, error } = message;
        // Resolve the pending promise (this would need a proper promise registry)
        handleFunctionResult(requestId, result, error);
    }
});

const pendingRequests = new Map();
let requestIdCounter = 0;

async function executeToolFunction(params) {
    return new Promise((resolve, reject) => {
        const requestId = ++requestIdCounter;
        pendingRequests.set(requestId, { resolve, reject });
        
        // Send execution request to parent process
        process.send({
            type: 'execute-function',
            requestId,
            toolName: '${server.toolFunction.name}',
            params
        });
        
        // Timeout after 30 seconds
        setTimeout(() => {
            if (pendingRequests.has(requestId)) {
                pendingRequests.delete(requestId);
                reject(new Error('Function execution timeout'));
            }
        }, 30000);
    });
}

function handleFunctionResult(requestId, result, error) {
    const pending = pendingRequests.get(requestId);
    if (pending) {
        pendingRequests.delete(requestId);
        if (error) {
            pending.reject(new Error(error));
        } else {
            pending.resolve(result);
        }
    }
}

// Register the tool
server.tool('${toolId}', '${server.toolFunction.description || ""}', parameterSchema.shape, async (params) => {
    try {
        const result = await executeToolFunction(params);
        return {
            content: [{ 
                type: 'text', 
                text: typeof result === 'string' ? result : JSON.stringify(result) 
            }]
        };
    } catch (error) {
        return {
            content: [{ 
                type: 'text', 
                text: \`Error executing tool: \${error instanceof Error ? error.message : 'Unknown error'}\`
            }],
            isError: true
        };
    }
});

// Create HTTP server
const httpServer = createServer();
const transport = new StreamableHTTPServerTransport({});

httpServer.on('request', async (req, res) => {
    if (req.url === '/mcp' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const jsonBody = JSON.parse(body);
                await transport.handleRequest(req, res, jsonBody);
            } catch (error) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
        });
    } else if (req.url === '/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'healthy', tool: '${server.toolFunction.name}' }));
    } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
    }
});

// Start the server
await server.connect(transport);
httpServer.listen(${server.port}, () => {
    console.log(\`MCP tool server '${server.toolFunction.name}' listening on port ${server.port}\`);
    
    // Notify parent that server is ready
    if (process.send) {
        process.send({ type: 'server-ready' });
    }
});

process.on('SIGTERM', () => {
    httpServer.close(() => {
        console.log('Server stopped');
        process.exit(0);
    });
});
`;
	}

	private async startServer(server: ModuleHostedToolServer): Promise<void> {
		const toolId = this.getToolId(server.toolFunction.name);
		const serverDir = join(this.baseDir, toolId);
		const serverFile = server.moduleFile;

		return new Promise((resolve, reject) => {
			const childProcess = spawn("node", [serverFile], {
				cwd: serverDir,
				stdio: ["ignore", "pipe", "pipe", "ipc"], // Enable IPC
				detached: false,
			});

			server.process = childProcess;
			server.pid = childProcess.pid;

			// Handle IPC messages from child process
			childProcess.on("message", (message) => {
				if ((message as any).type === "execute-function") {
					// Execute the function in the parent process context
					this.handleFunctionExecution(message as any, childProcess);
				} else if ((message as any).type === "server-ready") {
					logger.info({ toolId }, "Tool server reported ready via IPC");
				}
			});

			childProcess.stdout?.on("data", (data) => {
				logger.info(
					{ toolId },
					`Tool server stdout: ${data.toString().trim()}`,
				);
			});

			childProcess.stderr?.on("data", (data) => {
				logger.error(
					{ toolId },
					`Tool server stderr: ${data.toString().trim()}`,
				);
			});

			childProcess.on("error", (error) => {
				logger.error(
					{ toolId, error: error.message },
					"Failed to start tool server",
				);
				reject(error);
			});

			childProcess.on("exit", (code, signal) => {
				logger.info({ toolId, code, signal }, "Tool server process exited");
				server.status = "stopped";
				server.process = undefined;
				server.pid = undefined;
			});

			// Give the process a moment to start
			setTimeout(() => {
				if (childProcess.pid) {
					resolve();
				} else {
					reject(new Error("Failed to start server process"));
				}
			}, 1000);
		});
	}

	private async handleFunctionExecution(
		message: any,
		childProcess: ChildProcess,
	): Promise<void> {
		const { requestId, toolName, params } = message;
		const toolFunction = this.toolModules.get(this.getToolId(toolName));

		if (!toolFunction) {
			childProcess.send({
				type: "function-result",
				requestId,
				error: `Tool function not found: ${toolName}`,
			});
			return;
		}

		try {
			const result = await toolFunction.execute(params);
			childProcess.send({
				type: "function-result",
				requestId,
				result,
			});
		} catch (error) {
			childProcess.send({
				type: "function-result",
				requestId,
				error: error instanceof Error ? error.message : "Unknown error",
			});
		}
	}

	private async waitForServerReady(
		server: ModuleHostedToolServer,
		maxRetries = 10,
	): Promise<void> {
		for (let i = 0; i < maxRetries; i++) {
			try {
				const response = await fetch(`http://localhost:${server.port}/health`);
				if (response.ok) {
					logger.info(
						{ toolId: this.getToolId(server.toolFunction.name) },
						"Server health check passed",
					);
					return;
				}
			} catch (_error) {
				// Server not ready yet
			}

			await new Promise((resolve) => setTimeout(resolve, 500));
		}

		throw new Error(
			`Server failed to become ready after ${maxRetries} attempts`,
		);
	}
}

// Singleton instance
export const moduleHostedToolManager = new ModuleHostedToolManager();
