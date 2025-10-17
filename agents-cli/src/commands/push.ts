import { PushCommandHandler } from '../application/PushCommandHandler';
import { ProjectLoader } from '../domain/ProjectLoader';
import { ProjectPusher } from '../domain/ProjectPusher';
import { outputService, spinnerService, tableService } from '../presentation';
import { CLIPresenter } from '../presentation/CLIPresenter';

export interface PushOptions {
  project?: string;
  config?: string;
  env?: string;
  json?: boolean;
}

/**
 * Push command entry point
 *
 * Creates and executes a PushCommandHandler with all required dependencies.
 */
export async function pushCommand(options: PushOptions): Promise<void> {
  // Create dependencies
  const presenter = new CLIPresenter(outputService, tableService);
  const projectLoader = new ProjectLoader();
  const projectPusher = new ProjectPusher();

  // Create handler and execute
  const handler = new PushCommandHandler(
    outputService,
    spinnerService,
    presenter,
    projectLoader,
    projectPusher
  );

  await handler.execute(options);
}
