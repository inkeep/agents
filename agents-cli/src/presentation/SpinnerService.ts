import ora, { type Ora } from 'ora';
import { OutputMode } from './OutputService';

/**
 * Service for managing progress spinners
 *
 * This service abstracts ora spinner functionality and provides
 * a consistent interface for displaying progress indicators.
 * It respects output modes (quiet, JSON) and provides null-object pattern.
 */
export class SpinnerService {
  private activeSpinner: Ora | null = null;

  constructor(private mode: OutputMode = OutputMode.NORMAL) {}

  /**
   * Set the output mode
   */
  setMode(mode: OutputMode): void {
    this.mode = mode;
  }

  /**
   * Start a new spinner with the given text
   * Returns a spinner handle that can be used to update or stop it
   */
  start(text: string): SpinnerHandle {
    // Don't show spinners in quiet or JSON mode
    if (this.mode !== OutputMode.NORMAL) {
      return new NullSpinnerHandle();
    }

    // Stop any existing spinner first
    if (this.activeSpinner) {
      this.activeSpinner.stop();
    }

    this.activeSpinner = ora(text).start();
    return new OraSpinnerHandle(this.activeSpinner);
  }

  /**
   * Stop the currently active spinner without any status
   */
  stop(): void {
    if (this.activeSpinner) {
      this.activeSpinner.stop();
      this.activeSpinner = null;
    }
  }

  /**
   * Check if a spinner is currently active
   */
  isActive(): boolean {
    return this.activeSpinner !== null && this.activeSpinner.isSpinning;
  }
}

/**
 * Handle for controlling a spinner instance
 */
export interface SpinnerHandle {
  /**
   * Update the spinner text
   */
  setText(text: string): void;

  /**
   * Mark the spinner as successful and stop it
   */
  succeed(text?: string): void;

  /**
   * Mark the spinner as failed and stop it
   */
  fail(text?: string): void;

  /**
   * Mark the spinner as warning and stop it
   */
  warn(text?: string): void;

  /**
   * Mark the spinner as info and stop it
   */
  info(text?: string): void;

  /**
   * Stop the spinner without any status indicator
   */
  stop(): void;
}

/**
 * Real spinner handle that wraps ora
 */
class OraSpinnerHandle implements SpinnerHandle {
  constructor(private spinner: Ora) {}

  setText(text: string): void {
    this.spinner.text = text;
  }

  succeed(text?: string): void {
    this.spinner.succeed(text);
  }

  fail(text?: string): void {
    this.spinner.fail(text);
  }

  warn(text?: string): void {
    this.spinner.warn(text);
  }

  info(text?: string): void {
    this.spinner.info(text);
  }

  stop(): void {
    this.spinner.stop();
  }
}

/**
 * Null object pattern for spinners when output is disabled
 */
class NullSpinnerHandle implements SpinnerHandle {
  setText(_text: string): void {
    // No-op
  }

  succeed(_text?: string): void {
    // No-op
  }

  fail(_text?: string): void {
    // No-op
  }

  warn(_text?: string): void {
    // No-op
  }

  info(_text?: string): void {
    // No-op
  }

  stop(): void {
    // No-op
  }
}

/**
 * Singleton instance for convenience
 */
export const spinnerService = new SpinnerService();
