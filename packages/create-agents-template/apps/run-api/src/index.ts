import { loadEnvironmentFiles } from "@inkeep/agents-core";
loadEnvironmentFiles();
import "./instrumentation.js";
import "hono";

import { createExecutionApp } from "@inkeep/agents-run-api";
import { credentialStores } from "../../shared/credential-stores.js";

import type { Hono } from "hono";

const inkeep_run_api_port = 3003;

// Create the Hono app
const app: Hono = createExecutionApp({
	serverConfig: {
		port: inkeep_run_api_port,
		serverOptions: {
			requestTimeout: 120000,
			keepAliveTimeout: 60000,
			keepAlive: true,
		},
	},
	credentialStores,
});

export default app;
