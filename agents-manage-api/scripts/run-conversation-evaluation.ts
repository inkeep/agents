#!/usr/bin/env tsx

import type { DatabaseClient } from '@inkeep/agents-core';
import {
  createConversationEvaluationConfig,
  createEvaluator,
  generateId,
  getConversation,
  getLogger,
  linkEvaluatorToConfig,
  loadEnvironmentFiles,
} from '@inkeep/agents-core';
import dbClient from '../src/data/db/dbClient';
import { runConversationEvaluation } from '../src/services/EvaluationService';

loadEnvironmentFiles();

const logger = getLogger('EvaluationScript');

// Configuration
const EXISTING_CONVERSATION_ID = 'cfbtzwukwufv3bqgo0gh6';
const TENANT_ID = 'default'; // Update this with your tenant ID
const PROJECT_ID = 'test-agents'; // Update this with your project ID

interface ScriptResult {
  success: boolean;
  tenantId: string;
  projectId: string;
  conversationId: string;
  evaluationConfigId?: string;
  results?: unknown;
  error?: string;
}

async function verifyConversation(db: DatabaseClient) {
  logger.info(
    { conversationId: EXISTING_CONVERSATION_ID, tenantId: TENANT_ID, projectId: PROJECT_ID },
    'Verifying conversation exists'
  );

  // First, let's check what conversations exist in the database
  const { conversations } = await import('@inkeep/agents-core');
  const { eq } = await import('drizzle-orm');
  
  // Check for the specific conversation
  const specificConversation = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, EXISTING_CONVERSATION_ID))
    .limit(1);

  // Also list some recent conversations to help debug
  const recentConversations = await db
    .select({
      id: conversations.id,
      tenantId: conversations.tenantId,
      projectId: conversations.projectId,
      title: conversations.title,
      createdAt: conversations.createdAt,
    })
    .from(conversations)
    .limit(10);

  logger.info(
    {
      conversationId: EXISTING_CONVERSATION_ID,
      foundSpecificConversation: specificConversation.map((c: any) => ({
        id: c.id,
        tenantId: c.tenantId,
        projectId: c.projectId,
      })),
      recentConversations: recentConversations.map((c) => ({
        id: c.id,
        tenantId: c.tenantId,
        projectId: c.projectId,
        title: c.title,
      })),
      totalFound: recentConversations.length,
    },
    'Database conversations'
  );

  const conversation = await getConversation(db)({
    scopes: { tenantId: TENANT_ID, projectId: PROJECT_ID },
    conversationId: EXISTING_CONVERSATION_ID,
  });

  if (!conversation) {
    throw new Error(
      `Conversation ${EXISTING_CONVERSATION_ID} not found for tenant ${TENANT_ID} and project ${PROJECT_ID}. Check the foundConversations in logs above to see actual tenant/project IDs.`
    );
  }

  logger.info(
    {
      conversationId: conversation.id,
      activeSubAgentId: conversation.activeSubAgentId,
      title: conversation.title,
    },
    'Conversation found'
  );

  return conversation;
}

async function setupEvaluator(db: DatabaseClient, tenantId: string) {
  const evaluatorId = `evaluator-${generateId()}`;

  logger.info({ evaluatorId, tenantId }, 'Creating test evaluator');

  const evaluator = await createEvaluator(db)({
    tenantId,
    id: evaluatorId,
    name: 'Customer Satisfaction Evaluator',
    description: 'Evaluates the quality of customer support interactions',
    prompt: `You are evaluating a customer support conversation.
Assess the following aspects:
1. Response Quality: Were the agent's responses helpful and accurate?
2. Professionalism: Was the agent polite and professional?
3. Resolution: Did the conversation move towards resolving the customer's issue?
4. Empathy: Did the agent show understanding of the customer's concern?

Rate each aspect on a scale of 1-5, where 5 is excellent and 1 is poor.
Provide an overall score as the average of all aspects.`,
    schema: {
      type: 'object',
      properties: {
        responseQuality: {
          type: 'number',
          description: 'Quality of responses (1-5)',
          minimum: 1,
          maximum: 5,
        },
        professionalism: {
          type: 'number',
          description: 'Professionalism level (1-5)',
          minimum: 1,
          maximum: 5,
        },
        resolution: {
          type: 'number',
          description: 'Progress towards resolution (1-5)',
          minimum: 1,
          maximum: 5,
        },
        empathy: {
          type: 'number',
          description: 'Empathy shown (1-5)',
          minimum: 1,
          maximum: 5,
        },
        overallScore: {
          type: 'number',
          description: 'Overall score (average of all aspects)',
          minimum: 1,
          maximum: 5,
        },
        strengths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Key strengths identified',
        },
        areasForImprovement: {
          type: 'array',
          items: { type: 'string' },
          description: 'Areas that could be improved',
        },
      },
      required: [
        'responseQuality',
        'professionalism',
        'resolution',
        'empathy',
        'overallScore',
        'strengths',
        'areasForImprovement',
      ],
    },
    modelConfig: {
      model: 'claude-sonnet-4-20250514',
      providerOptions: {
        temperature: 0.3,
        maxTokens: 2048,
      },
    },
  });

  logger.info({ evaluatorId: evaluator.id }, 'Created evaluator');

  return evaluator.id;
}

async function setupEvaluationConfig(
  db: DatabaseClient,
  tenantId: string,
  projectId: string,
  evaluatorId: string,
  conversationId: string
) {
  const configId = `eval-config-${generateId()}`;

  logger.info({ configId, tenantId, conversationId }, 'Creating conversation evaluation config');

  const config = await createConversationEvaluationConfig(db)({
    tenantId,
    id: configId,
    name: 'Support Quality Evaluation',
    description: 'Evaluates specific customer support conversation',
    isActive: true,
    conversationFilter: {
      projectIds: [projectId],
      conversationIds: [conversationId],
    },
    sampleRate: 1.0,
    modelConfig: null,
  });

  // Link the evaluator to the config
  await linkEvaluatorToConfig(db)({
    tenantId,
    conversationEvaluationConfigId: config.id,
    evaluatorId,
  });

  logger.info(
    { configId: config.id, evaluatorId },
    'Created evaluation config and linked evaluator'
  );

  return config.id;
}

async function main(): Promise<ScriptResult> {
  const startTime = Date.now();

  try {
    logger.info({}, 'Starting conversation evaluation script');
    
    // Log database connection info
    logger.info(
      {
        DB_FILE_NAME: process.env.DB_FILE_NAME,
        TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL ? 'SET' : 'NOT SET',
        ENVIRONMENT: process.env.ENVIRONMENT,
      },
      'Database configuration'
    );

    const db = dbClient;

    // Verify the existing conversation exists
    await verifyConversation(db);

    // Create evaluator and evaluation config
    const evaluatorId = await setupEvaluator(db, TENANT_ID);
    const evaluationConfigId = await setupEvaluationConfig(
      db,
      TENANT_ID,
      PROJECT_ID,
      evaluatorId,
      EXISTING_CONVERSATION_ID
    );

    logger.info(
      {
        conversationEvaluationConfigId: evaluationConfigId,
        tenantId: TENANT_ID,
        conversationId: EXISTING_CONVERSATION_ID,
      },
      'Running conversation evaluation'
    );

    const results = await runConversationEvaluation(db)({
      scopes: { tenantId: TENANT_ID },
      conversationEvaluationConfigId: evaluationConfigId,
    });

    const duration = Date.now() - startTime;

    logger.info(
      {
        resultCount: results.length,
        durationMs: duration,
        results: results.map((r) => ({
          id: r.id,
          status: r.status,
          reasoning: r.reasoning,
          metadata: r.metadata,
        })),
      },
      'Evaluation completed successfully'
    );

    console.log('\n' + '='.repeat(80));
    console.log('EVALUATION RESULTS');
    console.log('='.repeat(80));
    console.log(`\nTenant ID: ${TENANT_ID}`);
    console.log(`Project ID: ${PROJECT_ID}`);
    console.log(`Conversation ID: ${EXISTING_CONVERSATION_ID}`);
    console.log(`Evaluation Config ID: ${evaluationConfigId}`);
    console.log(`\nTotal Results: ${results.length}`);
    console.log(`Duration: ${duration}ms`);

    for (const result of results) {
      console.log('\n' + '-'.repeat(80));
      console.log(`Result ID: ${result.id}`);
      console.log(`Status: ${result.status}`);
      console.log(`\nReasoning:\n${result.reasoning}`);
      console.log(`\nEvaluation Scores:`);
      console.log(JSON.stringify(result.metadata, null, 2));
    }

    console.log('\n' + '='.repeat(80) + '\n');

    return {
      success: true,
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      conversationId: EXISTING_CONVERSATION_ID,
      evaluationConfigId,
      results: results.map((r) => ({
        id: r.id,
        status: r.status,
        reasoning: r.reasoning,
        metadata: r.metadata,
      })),
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error({ error, durationMs: duration }, 'Evaluation script failed');
    console.error('\n❌ Evaluation failed:', error);

    return {
      success: false,
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      conversationId: EXISTING_CONVERSATION_ID,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Run the script
main()
  .then((result) => {
    if (result.success) {
      console.log('\n✅ Evaluation script completed successfully!');
      process.exit(0);
    } else {
      console.error('\n❌ Evaluation script failed!');
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
