import { CommandHandler } from './CommandHandler';
import { AgentLister } from '../domain/AgentLister';
import { OutputService } from '../presentation/OutputService';
import { SpinnerService } from '../presentation/SpinnerService';
import { CLIPresenter } from '../presentation/CLIPresenter';

/**
 * Options for the list-agents command
 */
export interface ListAgentsOptions {
  project: string; // required project ID
  config?: string;
  configFilePath?: string; // deprecated, kept for backward compatibility
}

/**
 * Handler for the list-agents command
 *
 * Orchestrates the agent listing flow by coordinating domain services
 * and presentation layers.
 */
export class ListAgentsCommandHandler extends CommandHandler<ListAgentsOptions, void> {
  constructor(
    output: OutputService,
    spinner: SpinnerService,
    presenter: CLIPresenter,
    private readonly agentLister: AgentLister
  ) {
    super(output, spinner, presenter);
  }

  async execute(options: ListAgentsOptions): Promise<void> {
    // Support deprecated configFilePath option
    const configPath = options.config || options.configFilePath;

    // Load configuration
    const config = await this.loadConfig(configPath);

    // Display configuration
    this.presenter.displayConfig(config);
    this.output.newline();

    // Fetch agents
    const spinnerHandle = this.spinner.start('Fetching agent...');

    try {
      const agents = await this.agentLister.list(config, {
        projectId: options.project,
        configPath,
      });

      spinnerHandle.succeed(`Found ${agents.length} agent(s) in project "${options.project}"`);

      // Display agent list
      this.presenter.displayAgentList(agents, options.project);
    } catch (error) {
      spinnerHandle.fail('Failed to fetch agent');
      this.handleError(error);
    }
  }
}
