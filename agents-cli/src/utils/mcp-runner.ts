#!/usr/bin/env node

/**
 * MCP Runner - Loads and starts MCP servers from a agent file
 * This is executed as a subprocess by the CLI
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';

const MCP_DIR = join(homedir(), '.inkeep', 'mcp');
const REGISTRY_FILE = join(MCP_DIR, 'servers.json');

// Ensure MCP directory exists
if (!existsSync(MCP_DIR)) {
  mkdirSync(MCP_DIR, { recursive: true });
}

interface McpServer {
  pid: number;
  agentId: string;
  toolId: string;
  name: string;
  port?: number;
  serverUrl?: string;
  deployment: 'local' | 'remote';
  transport?: string;
  command: string;
  startedAt: string;
  description?: string;
}

async function startServers(graphPath: string) {
  try {
    // Import the agent module
    const module = await import(graphPath);

    // Get servers
    const servers = module.servers || module.tools || [];

    // Get agent ID
    let agentId = 'unknown';
    if (module.agent && typeof module.agent.getId === 'function') {
      agentId = module.agent.getId();
    }

    const registeredServers: McpServer[] = [];
    let nextPort = 3100;

    // Start each server
    for (const server of servers) {
      if (!server) continue;

      // Get server metadata
      const name = server.name || 'unnamed';
      const id = server.id || name;
      const description = server.description || '';

      // Check deployment type
      const isLocal =
        typeof server.execute === 'function' ||
        typeof server.init === 'function' ||
        !server.serverUrl;

      if (isLocal) {
        // Start local server
        const port = server.port || nextPort++;

        // Initialize if needed
        if (typeof server.init === 'function') {
          await server.init();
        }

        // Create HTTP server for local MCP
        if (typeof server.execute === 'function') {
          const httpServer = http.createServer(async (req, res) => {
            if (req.method === 'POST' && req.url === '/mcp') {
              let body = '';
              req.on('data', (chunk) => (body += chunk));
              req.on('end', async () => {
                try {
                  const params = JSON.parse(body);
                  const result = await server.execute(params);
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ result }));
                } catch (error: any) {
                  res.writeHead(500, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: error.message }));
                }
              });
            } else {
              res.writeHead(404);
              res.end('Not Found');
            }
          });

          httpServer.listen(port, () => {
            console.log(
              JSON.stringify({
                type: 'server_started',
                name,
                port,
                deployment: 'local',
              })
            );
          });
        }

        registeredServers.push({
          pid: process.pid,
          agentId,
          toolId: id,
          name,
          port,
          deployment: 'local',
          transport: 'http',
          command: graphPath,
          startedAt: new Date().toISOString(),
          description,
        });
      } else {
        // Register remote server
        registeredServers.push({
          pid: process.pid,
          agentId,
          toolId: id,
          name,
          serverUrl: server.serverUrl || server.getServerUrl?.(),
          deployment: 'remote',
          transport: server.transport || 'http',
          command: graphPath,
          startedAt: new Date().toISOString(),
          description,
        });

        console.log(
          JSON.stringify({
            type: 'server_registered',
            name,
            serverUrl: server.serverUrl,
            deployment: 'remote',
          })
        );
      }
    }

    // Save to registry
    writeFileSync(REGISTRY_FILE, JSON.stringify({ servers: registeredServers }, null, 2));

    console.log(
      JSON.stringify({
        type: 'all_started',
        count: registeredServers.length,
      })
    );

    // Keep process alive
    process.stdin.resume();

    // Handle shutdown
    process.on('SIGINT', () => {
      console.log(JSON.stringify({ type: 'shutting_down' }));
      process.exit(0);
    });
  } catch (error: any) {
    console.error(
      JSON.stringify({
        type: 'error',
        message: error.message,
      })
    );
    process.exit(1);
  }
}

// Get agent path from command line
const graphPath = process.argv[2];
if (!graphPath) {
  console.error(
    JSON.stringify({
      type: 'error',
      message: 'Agent path is required',
    })
  );
  process.exit(1);
}

startServers(graphPath);
