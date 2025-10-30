import "hono";

import { createManagementApp } from "@inkeep/agents-manage-api";
import { credentialStores } from "../../shared/credential-stores.js";

import type { Hono } from "hono";

const inkeep_manage_api_port = 3002;

// Create the Hono app
const app: Hono = createManagementApp({
	serverConfig: {
		port: inkeep_manage_api_port,
		serverOptions: {
			requestTimeout: 60000,
			keepAliveTimeout: 60000,
			keepAlive: true,
		},
	},
	credentialStores,
});

export default app;
