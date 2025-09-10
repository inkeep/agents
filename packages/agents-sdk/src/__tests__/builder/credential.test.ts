import { CredentialStoreType } from "@inkeep/agents-core";
import { describe, expect, it } from "vitest";
import { credential } from "../../builders";

describe("credential builder function", () => {
	it("should create a credential with required fields", () => {
		const testCredential = credential({
			id: "test-api-key",
			type: CredentialStoreType.memory,
			credentialStoreId: "memory-default",
			retrievalParams: {
				key: "TEST_API_KEY",
			},
		});

		expect(testCredential).toEqual({
			id: "test-api-key",
			type: CredentialStoreType.memory,
			credentialStoreId: "memory-default",
			retrievalParams: {
				key: "TEST_API_KEY",
			},
		});
	});

	it("should handle different credential types", () => {
		const oauthCredential = credential({
			id: "oauth-token",
			type: CredentialStoreType.nango,
			credentialStoreId: "oauth-store",
			retrievalParams: {
				clientId: "client123",
				scope: "read:all",
			},
		});

		expect(oauthCredential.type).toBe("oauth");
		expect(oauthCredential.retrievalParams).toEqual({
			clientId: "client123",
			scope: "read:all",
		});
	});

	it("should handle vault credentials", () => {
		const vaultCredential = credential({
			id: "vault-secret",
			type: CredentialStoreType.keychain,
			credentialStoreId: "hashicorp-vault",
			retrievalParams: {
				path: "/secret/data/api-keys",
				field: "apiKey",
			},
		});

		expect(vaultCredential.type).toBe("vault");
		expect(vaultCredential.credentialStoreId).toBe("hashicorp-vault");
	});

	it("should handle nango credentials", () => {
		const nangoCredential = credential({
			id: "nango-integration",
			type: CredentialStoreType.nango,
			credentialStoreId: "nango-default",
			retrievalParams: {
				connectionId: "conn123",
				providerConfigKey: "github",
			},
		});

		expect(nangoCredential.type).toBe("nango");
		expect(nangoCredential.retrievalParams?.connectionId).toBe("conn123");
	});

	it("should handle empty retrieval params", () => {
		const simpleCredential = credential({
			id: "simple",
			type: CredentialStoreType.memory,
			credentialStoreId: "memory-default",
			retrievalParams: {},
		});

		expect(simpleCredential.retrievalParams).toEqual({});
	});

	it("should validate required fields", () => {
		expect(() => {
			// @ts-expect-error - missing required fields
			credential({
				id: "test",
			});
		}).toThrow();

		expect(() => {
			// @ts-expect-error - missing id
			credential({
				type: CredentialStoreType.memory,
				credentialStoreId: "memory-default",
				retrievalParams: {},
			});
		}).toThrow();
	});
});
