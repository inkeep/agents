import { generateFiles } from "fumadocs-openapi";

// Generate docs for the combined API (legacy)
void generateFiles({
	input: "./src/lib/index.json",
	output: "./content/docs/api-reference",
	per: "file",
	includeDescription: true,
});

// Generate docs for Run API
void generateFiles({
	input: "./src/lib/run-api.json",
	output: "./content/docs/api-reference/run-api",
	per: "file",
	includeDescription: true,
});

// Generate docs for Manage API
void generateFiles({
	input: "./src/lib/manage-api.json",
	output: "./content/docs/api-reference/manage-api",
	per: "file",
	includeDescription: true,
});
