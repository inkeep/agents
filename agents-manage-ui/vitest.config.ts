import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		include: ["src/**/*.{test,spec}.ts", "src/**/*.{test,spec}.tsx"],
		coverage: {
			provider: "v8",
			reporter: ["text", "html", "json", "lcov", "json-summary"],
			exclude: [
				"node_modules/",
				"dist/",
				".next/",
				"**/*.test.ts",
				"**/*.test.tsx",
				"**/*.spec.ts",
				"**/*.spec.tsx",
				"**/*.d.ts",
				"vitest.config.ts",
				"coverage/",
				"src/app/**/*.tsx", // Exclude Next.js app router pages
				"next.config.js",
				"tailwind.config.js",
				"postcss.config.js",
			],
			// Baseline thresholds - see COVERAGE_ROADMAP.md for improvement plan
			thresholds: {
				global: {
					branches: 20,
					functions: 20,
					lines: 20,
					statements: 20,
				},
			},
		},
	},
	resolve: {
		alias: {
			"@": fileURLToPath(new URL("./src", import.meta.url)),
		},
	},
});
