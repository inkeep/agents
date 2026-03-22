import { generateId } from '@inkeep/agents-core';
import { cleanupTenants } from '../../utils/cleanup';
import { makeRequest } from '../../utils/testRequest';
import { createTestTenantWithOrg } from '../../utils/testTenant';

describe('Skill Routes', () => {
  const createdTenants = new Set<string>();

  afterEach(async () => {
    await cleanupTenants(createdTenants);
    createdTenants.clear();
  });

  async function createTrackedTenant(suffix: string) {
    const tenantId = await createTestTenantWithOrg(suffix);
    createdTenants.add(tenantId);
    return tenantId;
  }

  async function createProject(tenantId: string, projectId: string) {
    const response = await makeRequest(`/manage/tenants/${tenantId}/projects`, {
      method: 'POST',
      body: JSON.stringify({
        id: projectId,
        name: 'Test Project',
        description: 'Test project',
        models: {
          base: {
            model: 'claude-sonnet-4',
            providerOptions: {},
          },
        },
      }),
    });

    expect(response.status).toBe(201);
  }

  test('should create, fetch, and update nested skill files', async () => {
    const tenantId = await createTrackedTenant('skills-crud');
    const projectId = `project-${generateId()}`;
    await createProject(tenantId, projectId);

    const createResponse = await makeRequest(
      `/manage/tenants/${tenantId}/projects/${projectId}/skills`,
      {
        method: 'POST',
        body: JSON.stringify({
          name: 'weather-safety-guardrails',
          description: 'Safety rules.',
          content: 'Always check the weather.',
          metadata: null,
          files: [
            {
              filePath: 'SKILL.md',
              content: `---
name: weather-safety-guardrails
description: "Safety rules."
---
Always check the weather.`,
            },
            {
              filePath: 'reference/safety-checklist.txt',
              content: 'Check alerts',
            },
          ],
        }),
      }
    );

    expect(createResponse.status).toBe(201);
    const createdBody = await createResponse.json();
    expect(createdBody.data.files).toEqual([
      expect.objectContaining({ filePath: 'SKILL.md' }),
      expect.objectContaining({ filePath: 'reference/safety-checklist.txt' }),
    ]);

    const listResponse = await makeRequest(
      `/manage/tenants/${tenantId}/projects/${projectId}/skills`
    );
    expect(listResponse.status).toBe(200);
    const listBody = await listResponse.json();
    expect(listBody.data[0].files).toBeUndefined();

    const detailResponse = await makeRequest(
      `/manage/tenants/${tenantId}/projects/${projectId}/skills/weather-safety-guardrails`
    );
    expect(detailResponse.status).toBe(200);
    const detailBody = await detailResponse.json();
    expect(detailBody.data.files.map((file: any) => file.filePath)).toEqual([
      'SKILL.md',
      'reference/safety-checklist.txt',
    ]);

    const updateResponse = await makeRequest(
      `/manage/tenants/${tenantId}/projects/${projectId}/skills/weather-safety-guardrails`,
      {
        method: 'PUT',
        body: JSON.stringify({
          description: 'Updated safety rules.',
          content: 'Always check alerts.',
          files: [
            {
              filePath: 'SKILL.md',
              content: `---
name: weather-safety-guardrails
description: "Updated safety rules."
---
Always check alerts.`,
            },
            {
              filePath: 'templates/alert.md',
              content: 'Alert template',
            },
          ],
        }),
      }
    );

    expect(updateResponse.status).toBe(200);
    const updatedBody = await updateResponse.json();
    expect(updatedBody.data.files.map((file: any) => file.filePath)).toEqual([
      'SKILL.md',
      'templates/alert.md',
    ]);
  });

  test('should remove all skill files when SKILL.md is removed from the file set', async () => {
    const tenantId = await createTrackedTenant('skills-remove-skill-md');
    const projectId = `project-${generateId()}`;
    await createProject(tenantId, projectId);

    const createResponse = await makeRequest(
      `/manage/tenants/${tenantId}/projects/${projectId}/skills`,
      {
        method: 'POST',
        body: JSON.stringify({
          name: 'weather-safety-guardrails',
          description: 'Safety rules.',
          content: 'Always check the weather.',
          metadata: null,
          files: [
            {
              filePath: 'SKILL.md',
              content: `---
name: weather-safety-guardrails
description: "Safety rules."
---
Always check the weather.`,
            },
            {
              filePath: 'templates/alert.md',
              content: 'Alert template',
            },
          ],
        }),
      }
    );

    expect(createResponse.status).toBe(201);

    const updateResponse = await makeRequest(
      `/manage/tenants/${tenantId}/projects/${projectId}/skills/weather-safety-guardrails`,
      {
        method: 'PUT',
        body: JSON.stringify({
          files: [
            {
              filePath: 'templates/alert.md',
              content: 'Alert template',
            },
          ],
        }),
      }
    );

    expect(updateResponse.status).toBe(200);
    const updatedBody = await updateResponse.json();
    expect(updatedBody.data.files).toEqual([]);
  });

  test('should create, fetch, update, and delete individual skill files by file id', async () => {
    const tenantId = await createTrackedTenant('skill-file-routes');
    const projectId = `project-${generateId()}`;
    await createProject(tenantId, projectId);

    const createResponse = await makeRequest(
      `/manage/tenants/${tenantId}/projects/${projectId}/skills`,
      {
        method: 'POST',
        body: JSON.stringify({
          name: 'structured-itinerary-responses',
          description: 'Structured itineraries.',
          content: 'Use itinerary templates.',
          metadata: null,
          files: [
            {
              filePath: 'SKILL.md',
              content: `---
name: structured-itinerary-responses
description: "Structured itineraries."
---
Use itinerary templates.`,
            },
          ],
        }),
      }
    );

    expect(createResponse.status).toBe(201);
    const createdBody = await createResponse.json();
    const entryFile = createdBody.data.files.find((file: any) => file.filePath === 'SKILL.md');

    expect(entryFile).toBeDefined();

    const createFileResponse = await makeRequest(
      `/manage/tenants/${tenantId}/projects/${projectId}/skills/structured-itinerary-responses/files`,
      {
        method: 'POST',
        body: JSON.stringify({
          filePath: 'templates/day/itinerary-card.html',
          content: '<article>Plan</article>',
        }),
      }
    );

    expect(createFileResponse.status).toBe(201);
    const createFileBody = await createFileResponse.json();
    const nestedFile = createFileBody.data;

    expect(nestedFile).toEqual(
      expect.objectContaining({
        filePath: 'templates/day/itinerary-card.html',
        content: '<article>Plan</article>',
      })
    );

    const getFileResponse = await makeRequest(
      `/manage/tenants/${tenantId}/projects/${projectId}/skills/structured-itinerary-responses/files/${nestedFile.id}`
    );

    expect(getFileResponse.status).toBe(200);
    const getFileBody = await getFileResponse.json();
    expect(getFileBody.data).toEqual(
      expect.objectContaining({
        id: nestedFile.id,
        filePath: 'templates/day/itinerary-card.html',
        content: '<article>Plan</article>',
      })
    );

    const updateNestedResponse = await makeRequest(
      `/manage/tenants/${tenantId}/projects/${projectId}/skills/structured-itinerary-responses/files/${nestedFile.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          content: '<article>Updated plan</article>',
        }),
      }
    );

    expect(updateNestedResponse.status).toBe(200);
    const updateNestedBody = await updateNestedResponse.json();
    expect(updateNestedBody.data).toEqual(
      expect.objectContaining({
        id: nestedFile.id,
        filePath: 'templates/day/itinerary-card.html',
        content: '<article>Updated plan</article>',
      })
    );

    const updateEntryResponse = await makeRequest(
      `/manage/tenants/${tenantId}/projects/${projectId}/skills/structured-itinerary-responses/files/${entryFile.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          content: `---
name: structured-itinerary-responses
description: "Updated structured itineraries."
---
Use updated itinerary templates.`,
        }),
      }
    );

    expect(updateEntryResponse.status).toBe(200);

    const detailResponse = await makeRequest(
      `/manage/tenants/${tenantId}/projects/${projectId}/skills/structured-itinerary-responses`
    );
    expect(detailResponse.status).toBe(200);
    const detailBody = await detailResponse.json();
    expect(detailBody.data.description).toBe('Updated structured itineraries.');
    expect(detailBody.data.files).toEqual([
      expect.objectContaining({
        id: entryFile.id,
        filePath: 'SKILL.md',
        content: `---
name: structured-itinerary-responses
description: "Updated structured itineraries."
---
Use updated itinerary templates.`,
      }),
      expect.objectContaining({
        id: nestedFile.id,
        filePath: 'templates/day/itinerary-card.html',
        content: '<article>Updated plan</article>',
      }),
    ]);

    const deleteFileResponse = await makeRequest(
      `/manage/tenants/${tenantId}/projects/${projectId}/skills/structured-itinerary-responses/files/${nestedFile.id}`,
      {
        method: 'DELETE',
      }
    );

    expect(deleteFileResponse.status).toBe(204);

    const afterDeleteResponse = await makeRequest(
      `/manage/tenants/${tenantId}/projects/${projectId}/skills/structured-itinerary-responses`
    );
    expect(afterDeleteResponse.status).toBe(200);
    const afterDeleteBody = await afterDeleteResponse.json();
    expect(afterDeleteBody.data.files).toEqual([
      expect.objectContaining({
        id: entryFile.id,
        filePath: 'SKILL.md',
      }),
    ]);
  });

  test('should round-trip nested skill files through the full project API', async () => {
    const tenantId = await createTrackedTenant('skills-project-full');
    const projectId = `project-${generateId()}`;

    const createResponse = await makeRequest(`/manage/tenants/${tenantId}/project-full`, {
      method: 'POST',
      body: JSON.stringify({
        id: projectId,
        name: 'Test Project',
        description: 'Test project',
        models: {
          base: {
            model: 'claude-sonnet-4',
            providerOptions: {},
          },
        },
        agents: {},
        tools: {},
        skills: {
          'structured-itinerary-responses': {
            id: 'structured-itinerary-responses',
            name: 'structured-itinerary-responses',
            description: 'Structured itineraries.',
            content: 'Use itinerary templates.',
            metadata: null,
            files: [
              {
                filePath: 'SKILL.md',
                content: `---
name: structured-itinerary-responses
description: "Structured itineraries."
---
Use itinerary templates.`,
              },
              {
                filePath: 'templates/day/itinerary-card.html',
                content: '<article>Plan</article>',
              },
            ],
          },
        },
      }),
    });

    expect(createResponse.status).toBe(201);

    const getResponse = await makeRequest(`/manage/tenants/${tenantId}/project-full/${projectId}`);
    expect(getResponse.status).toBe(200);
    const getBody = await getResponse.json();
    expect(getBody.data.skills['structured-itinerary-responses'].files).toEqual([
      {
        filePath: 'SKILL.md',
        content: `---
name: structured-itinerary-responses
description: "Structured itineraries."
---
Use itinerary templates.`,
      },
      {
        filePath: 'templates/day/itinerary-card.html',
        content: '<article>Plan</article>',
      },
    ]);
  });
});
