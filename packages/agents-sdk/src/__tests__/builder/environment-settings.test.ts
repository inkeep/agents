import { CredentialStoreType } from "@inkeep/agents-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createEnvironmentSettings,
	getAllEnvironmentSettingKeys,
	registerEnvironmentSettings,
} from "../../environment-settings";

// Test fixtures and helpers
const createMockCredential = (id: string, overrides = {}) => ({
	id,
	tenantId: "test-tenant",
	projectId: "test-project",
	type: CredentialStoreType.memory,
	credentialStoreId: "memory-default",
	retrievalParams: { key: `${id.toUpperCase()}_KEY` },
	createdAt: new Date().toISOString(),
	updatedAt: new Date().toISOString(),
	...overrides,
});

describe("Credential Environment Settings System", () => {
	const originalNodeEnv = process.env.NODE_ENV;

	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
		// Reset to test environment
		process.env.NODE_ENV = "test";
	});

	afterEach(() => {
		process.env.NODE_ENV = originalNodeEnv;
	});

	describe("Environment Setting Helpers", () => {
		it("should require environments to be provided", async () => {
			const helper = createEnvironmentSettings({});

			await expect(helper.getEnvironmentSetting("any-key")).rejects.toThrow(
				/No environments provided to createEnvironmentSettings/,
			);
			expect(helper.getEnvironmentSettingKeys()).toEqual([]);
			expect(helper.hasEnvironmentSetting("any-key")).toBe(false);
		});

		it("should provide type-safe helpers for single environment", async () => {
			const test = registerEnvironmentSettings({
				credentials: {
					"api-key": createMockCredential("api-key"),
					"oauth-token": createMockCredential("oauth-token", {
						type: CredentialStoreType.nango,
					}),
				},
			});

			const {
				getEnvironmentSettingKeys,
				hasEnvironmentSetting,
				getEnvironmentSetting,
			} = createEnvironmentSettings({ test });

			expect(getEnvironmentSettingKeys().sort()).toEqual([
				"api-key",
				"oauth-token",
			]);
			expect(hasEnvironmentSetting("api-key")).toBe(true);
			expect(hasEnvironmentSetting("missing")).toBe(false);

			// Test actual environment setting resolution
			const apiKey = await getEnvironmentSetting("api-key");
			expect(apiKey).toMatchObject({
				id: "api-key",
				type: CredentialStoreType.memory,
				credentialStoreId: "memory-default",
			});
		});

		it("should compute intersection for multiple environments", async () => {
			const development = registerEnvironmentSettings({
				credentials: {
					"dev-only": createMockCredential("dev-only"),
					shared: createMockCredential("shared"),
				},
			});

			const production = registerEnvironmentSettings({
				credentials: {
					"prod-only": createMockCredential("prod-only", {
						type: CredentialStoreType.nango,
					}),
					shared: createMockCredential("shared", {
						type: CredentialStoreType.nango,
					}),
				},
			});

			const {
				getEnvironmentSettingKeys,
				hasEnvironmentSetting,
				getEnvironmentSetting,
			} = createEnvironmentSettings({ development, production });

			expect(getEnvironmentSettingKeys()).toEqual(["shared"]);
			expect(hasEnvironmentSetting("shared")).toBe(true);
			expect(hasEnvironmentSetting("dev-only")).toBe(false);
			expect(hasEnvironmentSetting("prod-only")).toBe(false);

			// Test environment-specific environment setting resolution
			process.env.NODE_ENV = "production";
			const sharedCredential = await getEnvironmentSetting("shared");
			expect(sharedCredential.type).toBe(CredentialStoreType.nango); // Should use prod version

			process.env.NODE_ENV = "development";
			const devSharedCredential = await getEnvironmentSetting("shared");
			expect(devSharedCredential.type).toBe(CredentialStoreType.memory); // Should use dev version
		});

		it("should handle empty environments gracefully", () => {
			const empty = registerEnvironmentSettings({ credentials: {} });
			const { getEnvironmentSettingKeys, hasEnvironmentSetting } =
				createEnvironmentSettings({
					empty,
				});

			expect(getEnvironmentSettingKeys()).toEqual([]);
			expect(hasEnvironmentSetting("anything")).toBe(false);
		});

		it("should throw errors for missing environment settings", async () => {
			const test = registerEnvironmentSettings({
				credentials: {
					"existing-environment-setting": createMockCredential(
						"existing-environment-setting",
					),
				},
			});

			const { getEnvironmentSetting } = createEnvironmentSettings({ test });

			await expect(
				getEnvironmentSetting("missing-environment-setting" as any),
			).rejects.toThrow(
				/Credential environment setting 'missing-environment-setting' not found in environment 'test'/,
			);
		});

		it("should automatically infer environment names from object keys", async () => {
			const local = registerEnvironmentSettings({
				credentials: {
					"local-key": createMockCredential("local-key"),
				},
			});

			const staging = registerEnvironmentSettings({
				credentials: {
					"staging-key": createMockCredential("staging-key"),
				},
			});

			const { getEnvironmentSetting } = createEnvironmentSettings({
				local,
				staging,
			});

			// Test that environment names are correctly inferred from environment settings
			process.env.NODE_ENV = "local";
			const localResult = await getEnvironmentSetting("local-key");
			expect(localResult.id).toBe("local-key");

			process.env.NODE_ENV = "staging";
			const stagingResult = await getEnvironmentSetting("staging-key");
			expect(stagingResult.id).toBe("staging-key");
		});
	});

	describe("Environment Management", () => {
		it("should define environments and track environment setting keys globally", () => {
			const initialKeyCount = getAllEnvironmentSettingKeys().length;

			const config = {
				credentials: {
					"api-credential": createMockCredential("api-credential"),
					"db-credential": createMockCredential("db-credential", {
						type: CredentialStoreType.nango,
					}),
				},
			};

			const result = registerEnvironmentSettings(config);

			// Should return config unchanged
			expect(result).toEqual(config);

			// Should register keys globally
			const updatedKeys = getAllEnvironmentSettingKeys();
			expect(updatedKeys).toContain("api-credential");
			expect(updatedKeys).toContain("db-credential");
			expect(updatedKeys.length).toBeGreaterThanOrEqual(initialKeyCount + 2);
			expect(Array.isArray(updatedKeys)).toBe(true);
		});

		it("should handle environments with no credentials", () => {
			const emptyConfig = { credentials: {} };
			const result = registerEnvironmentSettings(emptyConfig);

			expect(result).toEqual(emptyConfig);
			expect(getAllEnvironmentSettingKeys()).toEqual(expect.any(Array));
		});
	});

	describe("Edge Cases and Error Scenarios", () => {
		it("should handle concurrent environment setting resolution", async () => {
			const test = registerEnvironmentSettings({
				credentials: {
					"concurrent-test": createMockCredential("concurrent-test"),
				},
			});

			const { getEnvironmentSetting } = createEnvironmentSettings({ test });

			// Simulate concurrent access
			const promises = Array.from({ length: 3 }, () =>
				getEnvironmentSetting("concurrent-test"),
			);
			const results = await Promise.all(promises);

			results.forEach((result) => {
				expect(result.id).toBe("concurrent-test");
			});
		});

		it("should work with different credential store types", async () => {
			const test = registerEnvironmentSettings({
				credentials: {
					memory1: createMockCredential("memory1", {
						type: CredentialStoreType.memory,
					}),
					oauth1: createMockCredential("oauth1", {
						type: CredentialStoreType.nango,
						credentialStoreId: "nango-oauth",
					}),
					memory2: createMockCredential("memory2", {
						type: CredentialStoreType.memory,
					}),
				},
			});

			const {
				getEnvironmentSettingKeys,
				hasEnvironmentSetting,
				getEnvironmentSetting,
			} = createEnvironmentSettings({ test });
			const allKeys = getEnvironmentSettingKeys().sort();

			expect(allKeys).toEqual(["memory1", "memory2", "oauth1"]);
			expect(hasEnvironmentSetting("memory1")).toBe(true);
			expect(hasEnvironmentSetting("oauth1")).toBe(true);

			const memoryResult = await getEnvironmentSetting("memory1");
			const oauthResult = await getEnvironmentSetting("oauth1");

			expect(memoryResult.type).toBe(CredentialStoreType.memory);
			expect(oauthResult.type).toBe(CredentialStoreType.nango);
			expect(oauthResult.credentialStoreId).toBe("nango-oauth");
		});

		it("should error when NODE_ENV doesn't match any environment name", async () => {
			const production = registerEnvironmentSettings({
				credentials: {
					"prod-key": createMockCredential("prod-key"),
				},
			});

			const { getEnvironmentSetting } = createEnvironmentSettings({
				production,
			});

			// Should error clearly when NODE_ENV doesn't match any environment
			process.env.NODE_ENV = "test";
			await expect(getEnvironmentSetting("prod-key")).rejects.toThrow(
				/Environment 'test' not found/,
			);
		});
	});
});
