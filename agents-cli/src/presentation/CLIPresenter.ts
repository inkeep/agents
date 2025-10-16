import type { Project } from '@inkeep/agents-sdk';
import { OutputService } from './OutputService';
import { TableService, type TableRow } from './TableService';

/**
 * Credential tracking data structure
 */
export interface CredentialTracking {
  credentials: Record<string, { type?: string; credentialStoreId?: string }>;
  usage: Record<
    string,
    Array<{
      type: string;
      id: string;
    }>
  >;
}

/**
 * Agent data structure for listing
 */
export interface AgentInfo {
  id: string;
  name?: string;
  defaultSubAgentId?: string | null;
  createdAt?: string;
}

/**
 * CLIPresenter formats and displays command results
 *
 * This class contains presentation logic for specific commands,
 * using OutputService and TableService for consistent styling.
 */
export class CLIPresenter {
  constructor(
    private output: OutputService,
    private table: TableService
  ) {}

  /**
   * Display the result of a successful project push
   */
  displayPushSuccess(project: Project, credentialTracking?: CredentialTracking): void {
    const projectId = project.getId();
    const projectName = project.getName();
    const stats = project.getStats();

    this.output.section('📊 Project Summary:');
    this.output.label('Project ID', projectId);
    this.output.label('Name', projectName);
    this.output.label('Agent', stats.agentCount.toString());
    this.output.label('Tenant', stats.tenantId);

    // Display agent details if they exist
    const agents = project.getAgents();
    if (agents.length > 0) {
      this.output.section('📊 Agent Details:');
      for (const agent of agents) {
        const agentStats = agent.getStats();
        this.output.secondary(
          `  • ${agent.getName()} (${agent.getId()}): ${agentStats.agentCount} agents`
        );
      }
    }

    // Display credential tracking information if provided
    if (credentialTracking) {
      const credentialCount = Object.keys(credentialTracking.credentials).length;

      if (credentialCount > 0) {
        this.output.section('🔐 Credentials:');
        this.output.label('Total credentials', credentialCount.toString());

        // Show credential details
        for (const [credId, credData] of Object.entries(credentialTracking.credentials)) {
          const usageInfo = credentialTracking.usage[credId] || [];
          const credType = credData.type || 'unknown';
          const storeId = credData.credentialStoreId || 'unknown';

          this.output.secondary(`  • ${credId} (${credType}, store: ${storeId})`);

          if (usageInfo.length > 0) {
            const usageByType: Record<string, number> = {};
            for (const usage of usageInfo) {
              usageByType[usage.type] = (usageByType[usage.type] || 0) + 1;
            }

            const usageSummary = Object.entries(usageByType)
              .map(([type, count]) => `${count} ${type}${count > 1 ? 's' : ''}`)
              .join(', ');

            this.output.secondary(`      Used by: ${usageSummary}`);
          }
        }
      }
    }

    // Provide next steps
    this.output.newline();
    this.output.success('✨ Next steps:');
    this.output.list(['Test your project: inkeep chat', 'View all agent: inkeep list-agent']);
  }

  /**
   * Display JSON output for project data
   */
  displayProjectJson(projectDefinition: unknown, projectDir: string): void {
    this.output.secondary(`  • File: ${projectDir}/project.json`);
    this.output.secondary(`  • Size: ${JSON.stringify(projectDefinition).length} bytes`);

    // Show a summary of what was saved
    const data = projectDefinition as {
      agents?: Record<string, { subAgents?: Record<string, unknown> }>;
      tools?: Record<string, unknown>;
    };

    const agentCount = Object.keys(data.agents || {}).length;
    const toolCount = Object.keys(data.tools || {}).length;
    const subAgentCount = Object.values(data.agents || {}).reduce((total, agent) => {
      return total + Object.keys(agent.subAgents || {}).length;
    }, 0);

    this.output.section('📊 Project Data Summary:');
    this.output.label('Agent', agentCount.toString());
    this.output.label('Tools', toolCount.toString());
    this.output.label('SubAgent', subAgentCount.toString());

    this.output.newline();
    this.output.success('✨ JSON file generated successfully!');
  }

  /**
   * Display a list of agents in a table
   */
  displayAgentList(agents: AgentInfo[], projectId: string): void {
    if (agents.length === 0) {
      this.output.secondary(
        `No agent found in project "${projectId}". Define agent in your project and run: inkeep push`
      );
      return;
    }

    const rows: TableRow[] = agents.map((agent) => {
      const createdDate = agent.createdAt
        ? new Date(agent.createdAt).toLocaleDateString()
        : 'Unknown';

      return [
        agent.id || '',
        agent.name || agent.id || '',
        agent.defaultSubAgentId || 'None',
        createdDate,
      ];
    });

    this.table.simple(['Agent ID', 'Name', 'Default Agent', 'Created'], rows);
  }

  /**
   * Display configuration information
   */
  displayConfig(config: {
    tenantId: string;
    agentsManageApiUrl: string;
    agentsRunApiUrl: string;
    sources?: { configFile?: string };
  }): void {
    this.output.secondary('Configuration:');
    this.output.label('Tenant ID', config.tenantId);
    this.output.label('Manage API URL', config.agentsManageApiUrl);
    this.output.label('Run API URL', config.agentsRunApiUrl);
    if (config.sources?.configFile) {
      this.output.label('Config file', config.sources.configFile);
    }
  }

  /**
   * Display environment credentials info
   */
  displayCredentialsLoaded(environment: string, credentialCount: number): void {
    this.output.secondary(`  • Environment: ${environment}`);
    this.output.secondary(`  • Credentials loaded: ${credentialCount}`);
  }

  /**
   * Display a hint message
   */
  displayHint(message: string, commands?: string[]): void {
    this.output.warning(`\nHint: ${message}`);
    if (commands && commands.length > 0) {
      for (const cmd of commands) {
        this.output.secondary(`  ${cmd}`);
      }
    }
  }
}
