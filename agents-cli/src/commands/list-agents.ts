import { ListAgentsCommandHandler } from '../application/ListAgentsCommandHandler';
import { AgentLister } from '../domain/AgentLister';
import { outputService, spinnerService, tableService } from '../presentation';
import { CLIPresenter } from '../presentation/CLIPresenter';

export interface ListAgentsOptions {
  project: string; // required project ID
  config?: string;
  configFilePath?: string; // deprecated, kept for backward compatibility
}

/**
 * List agents command entry point
 *
 * Creates and executes a ListAgentsCommandHandler with all required dependencies.
 */
export async function listAgentsCommand(options: ListAgentsOptions): Promise<void> {
  // Create dependencies
  const presenter = new CLIPresenter(outputService, tableService);
  const agentLister = new AgentLister();

  // Create handler and execute
  const handler = new ListAgentsCommandHandler(
    outputService,
    spinnerService,
    presenter,
    agentLister
  );

  await handler.execute(options);
}
