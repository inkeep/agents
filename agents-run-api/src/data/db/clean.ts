import {
  agentArtifactComponents,
  agentDataComponents,
  agentGraph,
  agentRelations,
  agents,
  agentToolRelations,
  artifactComponents,
  contextCache,
  contextConfigs,
  conversations,
  credentialReferences,
  dataComponents,
  externalAgents,
  ledgerArtifacts,
  messages,
  taskRelations,
  tasks,
  tools,
} from '@inkeep/agents-core';
import { sql } from 'drizzle-orm';
import { env } from '../../env';
import dbClient from './dbClient';

/**
 * Truncates all tables in the database, respecting foreign key constraints
 * Tables are cleared in dependency order (child tables first, then parent tables)
 */
export async function cleanDatabase() {
  console.log(`🗑️  Cleaning database for environment: ${env.ENVIRONMENT}`);
  console.log(`📁 Using database: ${env.DB_FILE_NAME}`);
  console.log('---');

  try {
    // Disable foreign key constraints temporarily to make cleanup easier
    await dbClient.run(sql`PRAGMA foreign_keys = OFF`);

    // Order matters: clear dependent tables first
    const tablesToClear = [
      { table: messages, name: 'messages' },
      { table: conversations, name: 'conversations' },
      { table: taskRelations, name: 'task_relations' },
      { table: tasks, name: 'tasks' },
      { table: agentArtifactComponents, name: 'agent_artifact_components' },
      { table: agentDataComponents, name: 'agent_data_components' },
      { table: agentToolRelations, name: 'agent_tool_relations' },
      { table: agentRelations, name: 'agent_relations' },
      { table: agentGraph, name: 'agent_graph' },
      { table: artifactComponents, name: 'artifact_components' },
      { table: dataComponents, name: 'data_components' },
      { table: tools, name: 'tools' },
      { table: agents, name: 'agents' },
      { table: externalAgents, name: 'external_agents' },
      { table: ledgerArtifacts, name: 'ledger_artifacts' },
      { table: credentialReferences, name: 'credential_references' },
      { table: contextConfigs, name: 'context_configs' },
      { table: contextCache, name: 'context_cache' },
    ];

    for (const { table, name } of tablesToClear) {
      try {
        await dbClient.delete(table).run();
        console.log(`✅ Cleared table: ${name}`);
      } catch (error: any) {
        // Handle case where table doesn't exist
        const errorMessage = error?.message || '';
        const causeMessage = error?.cause?.message || '';

        if (
          errorMessage.includes('no such table') ||
          causeMessage.includes('no such table') ||
          (error?.cause?.code === 'SQLITE_ERROR' && causeMessage.includes('no such table'))
        ) {
          console.log(`⚠️  Table ${name} doesn't exist, skipping`);
        } else {
          throw error;
        }
      }
    }

    // Re-enable foreign key constraints
    await dbClient.run(sql`PRAGMA foreign_keys = ON`);

    console.log('---');
    console.log('🎉 Database cleaned successfully');
  } catch (error) {
    console.error('❌ Failed to clean database:', error);
    throw error;
  }
}

// Run the clean function if executed directly
if (import.meta.url === new URL(import.meta.url).href) {
  cleanDatabase()
    .then(() => {
      console.log('Database cleanup completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Database cleanup failed:', error);
      process.exit(1);
    });
}
