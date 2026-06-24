import { describe, expect, it } from 'vitest';
import { testRunDbClient } from '../../../__tests__/setup';
import * as authSchema from '../../../auth/auth-schema';
import { conversations, evaluationResult, evaluationRun } from '../../../db/runtime/runtime-schema';
import { generateId } from '../../../utils/conversations';
import { type EvalResultsFilter, listEvaluationResultsPaginated } from '../evalRuns';

const tenantId = 'tenant-eval-runs-date-filter';
const projectId = 'project-1';
const scopes = { tenantId, projectId };
const evaluatorId = 'evaluator-1';
const subAgentId = 'sub-agent-1';

const CONV_DATE_EARLY = '2026-01-10T12:00:00.000Z';
const CONV_DATE_MID = '2026-01-15T12:00:00.000Z';
const CONV_DATE_LATE = '2026-01-20T12:00:00.000Z';

const convEarlyId = 'conv-early';
const convMidId = 'conv-mid';
const convLateId = 'conv-late';

async function insertOrganization() {
  await testRunDbClient.insert(authSchema.organization).values({
    id: tenantId,
    name: 'Test Organization',
    slug: 'test-organization-eval-runs',
    createdAt: new Date(),
  });
}

async function seedThreeConversationDateFixtures() {
  await insertOrganization();

  const runId = generateId();
  const resultWrittenAt = '2026-06-01T12:00:00.000Z';

  await testRunDbClient.insert(evaluationRun).values({
    tenantId,
    projectId,
    id: runId,
    createdAt: resultWrittenAt,
    updatedAt: resultWrittenAt,
  });

  const fixtures = [
    { id: convEarlyId, createdAt: CONV_DATE_EARLY },
    { id: convMidId, createdAt: CONV_DATE_MID },
    { id: convLateId, createdAt: CONV_DATE_LATE },
  ] as const;

  for (const { id, createdAt } of fixtures) {
    await testRunDbClient.insert(conversations).values({
      tenantId,
      projectId,
      id,
      activeSubAgentId: subAgentId,
      createdAt,
      updatedAt: createdAt,
    });

    await testRunDbClient.insert(evaluationResult).values({
      tenantId,
      projectId,
      id: generateId(),
      conversationId: id,
      evaluatorId,
      evaluationRunId: runId,
      createdAt: resultWrittenAt,
      updatedAt: resultWrittenAt,
    });
  }

  return { runId };
}

function listWithFilters(filters?: EvalResultsFilter) {
  return listEvaluationResultsPaginated(testRunDbClient)({
    scopes,
    filters,
  });
}

function conversationIds(result: Awaited<ReturnType<typeof listWithFilters>>) {
  return result.data.map((row) => row.conversationId).sort();
}

describe('listEvaluationResultsPaginated conversation date filters', () => {
  it('returns all results when neither startDate nor endDate is set', async () => {
    await seedThreeConversationDateFixtures();

    const result = await listWithFilters();

    expect(result.pagination.total).toBe(3);
    expect(conversationIds(result)).toEqual([convEarlyId, convLateId, convMidId]);
  });

  it('filters with startDate only (gte, inclusive boundary)', async () => {
    await seedThreeConversationDateFixtures();

    const result = await listWithFilters({ startDate: CONV_DATE_MID });

    expect(result.pagination.total).toBe(2);
    expect(conversationIds(result)).toEqual([convLateId, convMidId]);
  });

  it('filters with endDate only (lte, inclusive boundary)', async () => {
    await seedThreeConversationDateFixtures();

    const result = await listWithFilters({ endDate: CONV_DATE_MID });

    expect(result.pagination.total).toBe(2);
    expect(conversationIds(result)).toEqual([convEarlyId, convMidId]);
  });

  it('filters with both startDate and endDate on the same day (inclusive boundaries)', async () => {
    await seedThreeConversationDateFixtures();

    const result = await listWithFilters({
      startDate: CONV_DATE_MID,
      endDate: CONV_DATE_MID,
    });

    expect(result.pagination.total).toBe(1);
    expect(conversationIds(result)).toEqual([convMidId]);
  });

  it('filters by conversation createdAt, not evaluation result createdAt', async () => {
    await insertOrganization();

    const runId = generateId();
    const conversationCreatedAt = CONV_DATE_EARLY;
    const resultWrittenAt = '2026-06-01T12:00:00.000Z';
    const conversationId = 'conv-old-conversation';

    await testRunDbClient.insert(evaluationRun).values({
      tenantId,
      projectId,
      id: runId,
      createdAt: resultWrittenAt,
      updatedAt: resultWrittenAt,
    });

    await testRunDbClient.insert(conversations).values({
      tenantId,
      projectId,
      id: conversationId,
      activeSubAgentId: subAgentId,
      createdAt: conversationCreatedAt,
      updatedAt: conversationCreatedAt,
    });

    await testRunDbClient.insert(evaluationResult).values({
      tenantId,
      projectId,
      id: generateId(),
      conversationId,
      evaluatorId,
      evaluationRunId: runId,
      createdAt: resultWrittenAt,
      updatedAt: resultWrittenAt,
    });

    const excludedByConversationTime = await listWithFilters({
      startDate: '2026-06-01T00:00:00.000Z',
    });
    expect(excludedByConversationTime.pagination.total).toBe(0);
    expect(excludedByConversationTime.data).toHaveLength(0);

    const includedByConversationTime = await listWithFilters({
      endDate: '2026-01-31T00:00:00.000Z',
    });
    expect(includedByConversationTime.pagination.total).toBe(1);
    expect(conversationIds(includedByConversationTime)).toEqual([conversationId]);
  });
});
