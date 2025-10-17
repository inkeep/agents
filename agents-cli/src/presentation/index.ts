/**
 * Presentation Layer
 *
 * This module contains all UI/output concerns for the CLI.
 * Services in this layer are responsible for displaying information
 * to the user and should not contain business logic.
 */

export { OutputService, OutputMode, outputService } from './OutputService';
export { SpinnerService, type SpinnerHandle, spinnerService } from './SpinnerService';
export { TableService, type TableColumn, type TableRow, tableService } from './TableService';
export {
  CLIPresenter,
  type CredentialTracking,
  type AgentInfo,
} from './CLIPresenter';
