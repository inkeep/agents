import { defineConfig } from "drizzle-kit";

const getDbConfig = () => {
	// Prefer Turso if both URL + token are set
	if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
		return {
			dialect: "turso" as const,
			dbCredentials: {
				url: process.env.TURSO_DATABASE_URL,
				authToken: process.env.TURSO_AUTH_TOKEN,
			},
		};
	}

	// Otherwise, fallback to file
	return {
		dialect: "sqlite" as const,
		dbCredentials: {
			url: process.env.DB_FILE_NAME || "file:./local.db",
		},
	};
};

export default defineConfig({
	schema: "node_modules/@inkeep/agents-core/dist/db/schema.js",
	out: "node_modules/@inkeep/agents-core/drizzle",
	...getDbConfig(),
});
