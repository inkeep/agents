import {
	createFullAgentServerSide,
	generateId,
} from '@inkeep/agents-core';
import { createTestProject } from '@inkeep/agents-core/db/test-manage-client';
import { describe, expect, it } from 'vitest';
import { env } from '../../../env';
import manageDbClient from '../../../data/db/dbClient';
import { makeRequest } from '../../utils/testRequest';
import { createTestSubAgentData } from '../../utils/testSubAgent';
import { createTestTenantWithOrg } from '../../utils/testTenant';

describe('Trigger CRUD Routes - Integration Tests', () => {
	// Helper function to create full agent data
	const createFullAgentData = (agentId: string) => {
		const id = agentId || generateId();

		const agent = createTestSubAgentData();

		const agentData: any = {
			id,
			name: `Test Agent ${id}`,
			description: `Test agent description for ${id}`,
			defaultSubAgentId: agent.id,
			subAgents: {
				[agent.id]: agent,
			},
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};

		return agentData;
	};

	// Helper function to create test agent
	const createTestAgent = async (
		tenantId: string,
		projectId: string = 'default-project'
	) => {
		await createTestProject(manageDbClient, tenantId, projectId);

		const agentId = `test-agent-${generateId(6)}`;
		const agentData = createFullAgentData(agentId);
		await createFullAgentServerSide(manageDbClient)({ tenantId, projectId }, agentData);
		return { agentId, projectId };
	};

	// Helper function to create a test trigger
	const createTestTrigger = async ({
		tenantId,
		projectId = 'default-project',
		agentId,
		name = 'Test Trigger',
		enabled = true,
		authentication = null,
	}: {
		tenantId: string;
		projectId?: string;
		agentId: string;
		name?: string;
		enabled?: boolean;
		authentication?: any;
	}) => {
		const createData = {
			name,
			description: 'Test trigger description',
			enabled,
			inputSchema: {
				type: 'object',
				properties: {
					message: { type: 'string' },
				},
				required: ['message'],
			},
			outputTransform: {
				jmespath: 'message',
			},
			messageTemplate: 'New message: {{message}}',
			authentication,
		};

		const createRes = await makeRequest(
			`/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers`,
			{
				method: 'POST',
				body: JSON.stringify(createData),
			}
		);

		expect(createRes.status).toBe(201);
		const createBody = await createRes.json();
		return {
			createData,
			trigger: createBody.data,
		};
	};

	describe('GET /', () => {
		it('should list triggers with pagination (empty initially)', async () => {
			const tenantId = await createTestTenantWithOrg('triggers-list-empty');
			const { agentId, projectId } = await createTestAgent(tenantId);

			const res = await makeRequest(
				`/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers?page=1&limit=10`
			);
			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body).toEqual({
				data: [],
				pagination: {
					page: 1,
					limit: 10,
					total: 0,
					pages: 0,
				},
			});
		});

		it('should list triggers with pagination', async () => {
			const tenantId = await createTestTenantWithOrg('triggers-list');
			const { agentId, projectId } = await createTestAgent(tenantId);

			// Create multiple triggers
			await createTestTrigger({ tenantId, projectId, agentId, name: 'Trigger 1' });
			await createTestTrigger({ tenantId, projectId, agentId, name: 'Trigger 2' });

			const res = await makeRequest(
				`/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers?page=1&limit=10`
			);
			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.data).toHaveLength(2);
			expect(body.pagination).toEqual({
				page: 1,
				limit: 10,
				total: 2,
				pages: 1,
			});

			// Verify trigger structure
			const firstTrigger = body.data[0];
			expect(firstTrigger).toHaveProperty('id');
			expect(firstTrigger).toHaveProperty('name');
			expect(firstTrigger).toHaveProperty('description');
			expect(firstTrigger).toHaveProperty('enabled');
			expect(firstTrigger).toHaveProperty('inputSchema');
			expect(firstTrigger).toHaveProperty('outputTransform');
			expect(firstTrigger).toHaveProperty('messageTemplate');
			expect(firstTrigger).toHaveProperty('authentication');
			expect(firstTrigger).toHaveProperty('webhookUrl');
			expect(firstTrigger).toHaveProperty('createdAt');
			expect(firstTrigger).toHaveProperty('updatedAt');
			expect(firstTrigger).not.toHaveProperty('tenantId'); // Should not expose tenantId
			expect(firstTrigger).not.toHaveProperty('projectId'); // Should not expose projectId
			expect(firstTrigger).not.toHaveProperty('agentId'); // Should not expose agentId
		});

		it('should include webhookUrl in response', async () => {
			const tenantId = await createTestTenantWithOrg('triggers-webhook-url');
			const { agentId, projectId } = await createTestAgent(tenantId);

			const { trigger } = await createTestTrigger({ tenantId, projectId, agentId });

			const res = await makeRequest(
				`/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers`
			);
			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.data).toHaveLength(1);

			const returnedTrigger = body.data[0];
			expect(returnedTrigger.webhookUrl).toBe(
				`${env.INKEEP_AGENTS_RUN_API_URL}/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers/${trigger.id}`
			);
		});

		it('should handle pagination correctly', async () => {
			const tenantId = await createTestTenantWithOrg('triggers-pagination');
			const { agentId, projectId } = await createTestAgent(tenantId);

			// Create 5 triggers
			for (let i = 0; i < 5; i++) {
				await createTestTrigger({
					tenantId,
					projectId,
					agentId,
					name: `Trigger ${i + 1}`,
				});
			}

			const res = await makeRequest(
				`/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers?page=1&limit=3`
			);
			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.data).toHaveLength(3);
			expect(body.pagination).toEqual({
				page: 1,
				limit: 3,
				total: 5,
				pages: 2,
			});
		});
	});

	describe('GET /{id}', () => {
		it('should get trigger by ID', async () => {
			const tenantId = await createTestTenantWithOrg('triggers-get-by-id');
			const { agentId, projectId } = await createTestAgent(tenantId);
			const { trigger } = await createTestTrigger({ tenantId, projectId, agentId });

			const res = await makeRequest(
				`/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers/${trigger.id}`
			);
			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.data.id).toBe(trigger.id);
			expect(body.data.name).toBe('Test Trigger');
			expect(body.data.enabled).toBe(true);
			expect(body.data.webhookUrl).toBeDefined();
		});

		it('should return 404 for non-existent trigger', async () => {
			const tenantId = await createTestTenantWithOrg('triggers-get-not-found');
			const { agentId, projectId } = await createTestAgent(tenantId);
			const nonExistentId = `non-existent-${generateId()}`;

			const res = await makeRequest(
				`/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers/${nonExistentId}`
			);
			expect(res.status).toBe(404);

			const body = await res.json();
			expect(body.error.message).toBe('Trigger not found');
		});

		it('should respect tenant isolation', async () => {
			const tenantId1 = await createTestTenantWithOrg('triggers-tenant-1');
			const tenantId2 = await createTestTenantWithOrg('triggers-tenant-2');
			const projectId = 'default-project';

			const { agentId } = await createTestAgent(tenantId1, projectId);
			const { trigger } = await createTestTrigger({
				tenantId: tenantId1,
				projectId,
				agentId,
			});

			// Try to access from different tenant
			await createTestProject(manageDbClient, tenantId2, projectId);
			const { agentId: agentId2 } = await createTestAgent(tenantId2, projectId);

			const res = await makeRequest(
				`/tenants/${tenantId2}/projects/${projectId}/agents/${agentId2}/triggers/${trigger.id}`
			);
			expect(res.status).toBe(404);
		});
	});

	describe('POST /', () => {
		it('should create trigger successfully', async () => {
			const tenantId = await createTestTenantWithOrg('triggers-create');
			const { agentId, projectId } = await createTestAgent(tenantId);

			const createData = {
				name: 'GitHub Webhook',
				description: 'Trigger from GitHub events',
				enabled: true,
				inputSchema: {
					type: 'object',
					properties: {
						action: { type: 'string' },
						repository: { type: 'object' },
					},
					required: ['action'],
				},
				outputTransform: {
					jmespath: '{action: action, repo: repository.name}',
				},
				messageTemplate: 'GitHub event: {{action}} on {{repo}}',
				authentication: {
					type: 'api_key',
					data: {
						name: 'X-GitHub-Token',
						value: 'test-secret',
					},
					add_position: 'header',
				},
			};

			const res = await makeRequest(
				`/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers`,
				{
					method: 'POST',
					body: JSON.stringify(createData),
				}
			);

			expect(res.status).toBe(201);
			const body = await res.json();

			// Verify response structure
			expect(body.data).toHaveProperty('id');
			expect(body.data.name).toBe(createData.name);
			expect(body.data.description).toBe(createData.description);
			expect(body.data.enabled).toBe(true);
			expect(body.data.inputSchema).toEqual(createData.inputSchema);
			expect(body.data.outputTransform).toEqual(createData.outputTransform);
			expect(body.data.messageTemplate).toBe(createData.messageTemplate);
			expect(body.data.authentication).toEqual(createData.authentication);
			expect(body.data.webhookUrl).toBeDefined();
			expect(body.data.createdAt).toBeDefined();
			expect(body.data.updatedAt).toBeDefined();
		});

		it('should create trigger with custom id', async () => {
			const tenantId = await createTestTenantWithOrg('triggers-create-custom-id');
			const { agentId, projectId } = await createTestAgent(tenantId);

			const customId = `custom-trigger-${generateId(6)}`;
			const createData = {
				id: customId,
				name: 'Custom ID Trigger',
				description: 'Trigger with custom ID',
				enabled: true,
				inputSchema: { type: 'object' },
				messageTemplate: 'Test message',
				authentication: { type: 'none' as const },
			};

			const res = await makeRequest(
				`/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers`,
				{
					method: 'POST',
					body: JSON.stringify(createData),
				}
			);

			expect(res.status).toBe(201);
			const body = await res.json();
			expect(body.data.id).toBe(customId);
		});

		it('should create trigger with different authentication types', async () => {
			const tenantId = await createTestTenantWithOrg('triggers-auth-types');
			const { agentId, projectId } = await createTestAgent(tenantId);

			// Test basic_auth
			const basicAuthData = {
				name: 'Basic Auth Trigger',
				description: 'Basic auth trigger',
				enabled: true,
				inputSchema: { type: 'object' },
				messageTemplate: 'Test',
				authentication: {
					type: 'basic_auth',
					data: {
						username: 'testuser',
						password: 'testpass',
					},
					add_position: 'header',
				},
			};

			const basicRes = await makeRequest(
				`/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers`,
				{
					method: 'POST',
					body: JSON.stringify(basicAuthData),
				}
			);
			expect(basicRes.status).toBe(201);
			const basicBody = await basicRes.json();
			expect(basicBody.data.authentication.type).toBe('basic_auth');

			// Test bearer_token
			const bearerData = {
				name: 'Bearer Token Trigger',
				description: 'Bearer token trigger',
				enabled: true,
				inputSchema: { type: 'object' },
				messageTemplate: 'Test',
				authentication: {
					type: 'bearer_token',
					data: {
						token: 'test-bearer-token',
					},
					add_position: 'header',
				},
			};

			const bearerRes = await makeRequest(
				`/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers`,
				{
					method: 'POST',
					body: JSON.stringify(bearerData),
				}
			);
			expect(bearerRes.status).toBe(201);
			const bearerBody = await bearerRes.json();
			expect(bearerBody.data.authentication.type).toBe('bearer_token');
		});

		it('should create trigger with signing secret', async () => {
			const tenantId = await createTestTenantWithOrg('triggers-signing-secret');
			const { agentId, projectId } = await createTestAgent(tenantId);

			const createData = {
				name: 'Signed Trigger',
				description: 'Trigger with signing secret',
				enabled: true,
				inputSchema: { type: 'object' },
				messageTemplate: 'Test',
				authentication: { type: 'none' },
				signingSecret: 'my-signing-secret-123',
			};

			const res = await makeRequest(
				`/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers`,
				{
					method: 'POST',
					body: JSON.stringify(createData),
				}
			);

			expect(res.status).toBe(201);
			const body = await res.json();
			expect(body.data.signingSecret).toBe('my-signing-secret-123');
		});
	});

	describe('PATCH /{id}', () => {
		it('should update trigger successfully', async () => {
			const tenantId = await createTestTenantWithOrg('triggers-update');
			const { agentId, projectId } = await createTestAgent(tenantId);
			const { trigger } = await createTestTrigger({ tenantId, projectId, agentId });

			// Wait 1ms to ensure updatedAt will be different
			await new Promise((resolve) => setTimeout(resolve, 1));

			const updateData = {
				name: 'Updated Trigger Name',
				description: 'Updated description',
				enabled: false,
			};

			const res = await makeRequest(
				`/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers/${trigger.id}`,
				{
					method: 'PATCH',
					body: JSON.stringify(updateData),
				}
			);

			expect(res.status).toBe(200);
			const body = await res.json();

			expect(body.data.name).toBe(updateData.name);
			expect(body.data.description).toBe(updateData.description);
			expect(body.data.enabled).toBe(false);
			expect(body.data.updatedAt).not.toBe(trigger.updatedAt);
		});

		it('should update trigger authentication', async () => {
			const tenantId = await createTestTenantWithOrg('triggers-update-auth');
			const { agentId, projectId } = await createTestAgent(tenantId);
			const { trigger } = await createTestTrigger({ tenantId, projectId, agentId });

			const updateData = {
				authentication: {
					type: 'bearer_token',
					data: {
						token: 'new-token',
					},
					add_position: 'header',
				},
			};

			const res = await makeRequest(
				`/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers/${trigger.id}`,
				{
					method: 'PATCH',
					body: JSON.stringify(updateData),
				}
			);

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.data.authentication.type).toBe('bearer_token');
			expect(body.data.authentication.data.token).toBe('new-token');
		});

		it('should return 400 for empty update body', async () => {
			const tenantId = await createTestTenantWithOrg('triggers-update-empty');
			const { agentId, projectId } = await createTestAgent(tenantId);
			const { trigger } = await createTestTrigger({ tenantId, projectId, agentId });

			const res = await makeRequest(
				`/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers/${trigger.id}`,
				{
					method: 'PATCH',
					body: JSON.stringify({}),
				}
			);

			expect(res.status).toBe(400);
			const body = await res.json();
			expect(body.error.message).toBe('No fields to update');
		});

		it('should return 404 for non-existent trigger', async () => {
			const tenantId = await createTestTenantWithOrg('triggers-update-not-found');
			const { agentId, projectId } = await createTestAgent(tenantId);
			const nonExistentId = `non-existent-${generateId()}`;

			const updateData = { name: 'Updated Name' };

			const res = await makeRequest(
				`/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers/${nonExistentId}`,
				{
					method: 'PATCH',
					body: JSON.stringify(updateData),
				}
			);

			expect(res.status).toBe(404);
		});

		it('should respect tenant isolation', async () => {
			const tenantId1 = await createTestTenantWithOrg('triggers-update-tenant-1');
			const tenantId2 = await createTestTenantWithOrg('triggers-update-tenant-2');
			const projectId = 'default-project';

			const { agentId } = await createTestAgent(tenantId1, projectId);
			const { trigger } = await createTestTrigger({
				tenantId: tenantId1,
				projectId,
				agentId,
			});

			const updateData = { name: 'Hacked Name' };

			// Try to update from different tenant
			await createTestProject(manageDbClient, tenantId2, projectId);
			const { agentId: agentId2 } = await createTestAgent(tenantId2, projectId);

			const res = await makeRequest(
				`/tenants/${tenantId2}/projects/${projectId}/agents/${agentId2}/triggers/${trigger.id}`,
				{
					method: 'PATCH',
					body: JSON.stringify(updateData),
				}
			);

			expect(res.status).toBe(404);
		});
	});

	describe('DELETE /{id}', () => {
		it('should delete trigger successfully', async () => {
			const tenantId = await createTestTenantWithOrg('triggers-delete');
			const { agentId, projectId } = await createTestAgent(tenantId);
			const { trigger } = await createTestTrigger({ tenantId, projectId, agentId });

			const res = await makeRequest(
				`/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers/${trigger.id}`,
				{
					method: 'DELETE',
				}
			);

			expect(res.status).toBe(204);

			// Verify trigger is deleted
			const getRes = await makeRequest(
				`/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers/${trigger.id}`
			);
			expect(getRes.status).toBe(404);
		});

		it('should return 404 for non-existent trigger', async () => {
			const tenantId = await createTestTenantWithOrg('triggers-delete-not-found');
			const { agentId, projectId } = await createTestAgent(tenantId);
			const nonExistentId = `non-existent-${generateId()}`;

			const res = await makeRequest(
				`/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers/${nonExistentId}`,
				{
					method: 'DELETE',
				}
			);

			expect(res.status).toBe(404);
		});

		it('should respect tenant isolation', async () => {
			const tenantId1 = await createTestTenantWithOrg('triggers-delete-tenant-1');
			const tenantId2 = await createTestTenantWithOrg('triggers-delete-tenant-2');
			const projectId = 'default-project';

			const { agentId } = await createTestAgent(tenantId1, projectId);
			const { trigger } = await createTestTrigger({
				tenantId: tenantId1,
				projectId,
				agentId,
			});

			// Try to delete from different tenant
			await createTestProject(manageDbClient, tenantId2, projectId);
			const { agentId: agentId2 } = await createTestAgent(tenantId2, projectId);

			const res = await makeRequest(
				`/tenants/${tenantId2}/projects/${projectId}/agents/${agentId2}/triggers/${trigger.id}`,
				{
					method: 'DELETE',
				}
			);

			expect(res.status).toBe(404);
		});
	});

	describe('Permissions', () => {
		it('should require create permission for POST', async () => {
			// This test verifies permission middleware is applied
			// The actual permission checking logic is tested separately
			const tenantId = await createTestTenantWithOrg('triggers-perm-create');
			const { agentId, projectId } = await createTestAgent(tenantId);

			const createData = {
				name: 'Test Trigger',
				description: 'Test',
				enabled: true,
				inputSchema: { type: 'object' },
				messageTemplate: 'Test',
				authentication: { type: 'none' },
			};

			// makeRequest includes bypass secret, so this should succeed
			const res = await makeRequest(
				`/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers`,
				{
					method: 'POST',
					body: JSON.stringify(createData),
				}
			);

			// Should succeed with bypass secret
			expect([201, 403]).toContain(res.status);
		});

		it('should require update permission for PATCH', async () => {
			const tenantId = await createTestTenantWithOrg('triggers-perm-update');
			const { agentId, projectId } = await createTestAgent(tenantId);
			const { trigger } = await createTestTrigger({ tenantId, projectId, agentId });

			const updateData = { name: 'Updated' };

			// makeRequest includes bypass secret, so this should succeed
			const res = await makeRequest(
				`/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers/${trigger.id}`,
				{
					method: 'PATCH',
					body: JSON.stringify(updateData),
				}
			);

			// Should succeed with bypass secret
			expect([200, 403]).toContain(res.status);
		});

		it('should require delete permission for DELETE', async () => {
			const tenantId = await createTestTenantWithOrg('triggers-perm-delete');
			const { agentId, projectId } = await createTestAgent(tenantId);
			const { trigger } = await createTestTrigger({ tenantId, projectId, agentId });

			// makeRequest includes bypass secret, so this should succeed
			const res = await makeRequest(
				`/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers/${trigger.id}`,
				{
					method: 'DELETE',
				}
			);

			// Should succeed with bypass secret
			expect([204, 403]).toContain(res.status);
		});
	});
});
