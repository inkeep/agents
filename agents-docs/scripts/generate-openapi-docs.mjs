import { generateFiles } from "fumadocs-openapi";

void generateFiles({
	input: "./src/lib/index.json",
	output: "./content/docs/api-reference",
	per: "file",
	includeDescription: true,
});
