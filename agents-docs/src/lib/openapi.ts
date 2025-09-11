import { createOpenAPI } from "fumadocs-openapi/server";

export const openapi = createOpenAPI({
	// the OpenAPI schema, you can also give it an external URL.
	input: ["./src/lib/index.json"],
});

export const runApiOpenAPI = createOpenAPI({
	input: ["./src/lib/run-api.json"],
});

export const manageApiOpenAPI = createOpenAPI({
	input: ["./src/lib/manage-api.json"],
});
