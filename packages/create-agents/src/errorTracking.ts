import * as Sentry from '@sentry/node';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

const TELEMETRY_CONFIG_DIR = path.join(os.homedir(), '.inkeep');
const TELEMETRY_CONFIG_FILE = path.join(TELEMETRY_CONFIG_DIR, 'telemetry-config.json');

interface TelemetryConfig {
  enabled: boolean;
  askedConsent: boolean;
  userId?: string;
}

let telemetryConfig: TelemetryConfig | null = null;
let initialized = false;

/**
 * Initialize Sentry error tracking with privacy-first defaults
 */
export function initErrorTracking(version: string): void {
  // Skip initialization in test or development environments
  if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') {
    return;
  }

  // Respect DO_NOT_TRACK environment variable
  if (process.env.DO_NOT_TRACK === '1') {
    return;
  }

  // Check if telemetry is disabled via flag
  if (process.argv.includes('--disable-telemetry') || process.argv.includes('--no-telemetry')) {
    return;
  }

  // Load telemetry configuration
  telemetryConfig = loadTelemetryConfig();

  // If user has explicitly disabled telemetry, respect that
  if (telemetryConfig && !telemetryConfig.enabled) {
    return;
  }

  // Initialize Sentry only if DSN is configured
  const sentryDsn = process.env.SENTRY_DSN || 'https://your-sentry-dsn-here@sentry.io/project-id';

  // Skip initialization if using placeholder DSN
  if (sentryDsn.includes('your-sentry-dsn-here')) {
    return;
  }

  Sentry.init({
    dsn: sentryDsn,
    environment: process.env.NODE_ENV || 'production',
    release: `create-agents@${version}`,

    // Privacy settings
    beforeSend(event) {
      // Strip PII from event
      if (event.request) {
        delete event.request.cookies;
        delete event.request.headers;
      }

      // Scrub file paths to remove usernames
      if (event.exception?.values) {
        for (const exception of event.exception.values) {
          if (exception.stacktrace?.frames) {
            for (const frame of exception.stacktrace.frames) {
              if (frame.filename) {
                frame.filename = sanitizeFilePath(frame.filename);
              }
              if (frame.abs_path) {
                frame.abs_path = sanitizeFilePath(frame.abs_path);
              }
            }
          }
        }
      }

      // Scrub breadcrumbs
      if (event.breadcrumbs) {
        for (const breadcrumb of event.breadcrumbs) {
          if (breadcrumb.message) {
            breadcrumb.message = sanitizeFilePath(breadcrumb.message);
          }
          if (breadcrumb.data) {
            for (const [key, value] of Object.entries(breadcrumb.data)) {
              if (typeof value === 'string') {
                breadcrumb.data[key] = sanitizeFilePath(value);
              }
            }
          }
        }
      }

      return event;
    },

    // Sample rate (adjust based on usage)
    tracesSampleRate: 0.1,

    // Integrations
    integrations: [
      // Only include essential integrations
    ],
  });

  initialized = true;
}

/**
 * Sanitize file paths to remove PII (usernames, etc.)
 */
function sanitizeFilePath(filePath: string): string {
  // Replace home directory with ~
  const homeDir = os.homedir();
  if (filePath.includes(homeDir)) {
    return filePath.replace(homeDir, '~');
  }

  // Remove username from paths like /Users/username/ or /home/username/
  return filePath.replace(/\/(Users|home)\/[^/]+\//g, '/$1/<user>/');
}

/**
 * Load telemetry configuration from disk
 */
function loadTelemetryConfig(): TelemetryConfig {
  try {
    if (fs.existsSync(TELEMETRY_CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(TELEMETRY_CONFIG_FILE, 'utf-8'));
    }
  } catch (_error) {
    // Ignore errors loading config
  }

  // Default configuration - enabled but not asked yet
  return {
    enabled: true,
    askedConsent: false,
  };
}

/**
 * Save telemetry configuration to disk
 */
export function saveTelemetryConfig(config: TelemetryConfig): void {
  try {
    fs.ensureDirSync(TELEMETRY_CONFIG_DIR);
    fs.writeFileSync(TELEMETRY_CONFIG_FILE, JSON.stringify(config, null, 2));
    telemetryConfig = config;
  } catch (_error) {
    // Ignore errors saving config
  }
}

/**
 * Get current telemetry configuration
 */
export function getTelemetryConfig(): TelemetryConfig {
  if (!telemetryConfig) {
    telemetryConfig = loadTelemetryConfig();
  }
  return telemetryConfig;
}

/**
 * Disable telemetry
 */
export function disableTelemetry(): void {
  const config = getTelemetryConfig();
  config.enabled = false;
  config.askedConsent = true;
  saveTelemetryConfig(config);
}

/**
 * Enable telemetry
 */
export function enableTelemetry(): void {
  const config = getTelemetryConfig();
  config.enabled = true;
  config.askedConsent = true;
  saveTelemetryConfig(config);
}

/**
 * Capture an error to Sentry
 */
export function captureError(error: Error, context?: Record<string, any>): void {
  if (!initialized) {
    return;
  }

  if (context) {
    Sentry.setContext('additional', context);
  }

  Sentry.captureException(error);
}

/**
 * Capture a message to Sentry
 */
export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
  if (!initialized) {
    return;
  }

  Sentry.captureMessage(message, level);
}

/**
 * Add a breadcrumb for debugging context
 */
export function addBreadcrumb(message: string, data?: Record<string, any>): void {
  if (!initialized) {
    return;
  }

  Sentry.addBreadcrumb({
    message: sanitizeFilePath(message),
    data: data ? sanitizeData(data) : undefined,
    level: 'info',
    timestamp: Date.now() / 1000,
  });
}

/**
 * Sanitize data object to remove PII
 */
function sanitizeData(data: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeFilePath(value);
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeData(value as Record<string, any>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Flush pending events and close Sentry connection
 */
export async function closeSentry(): Promise<void> {
  if (!initialized) {
    return;
  }

  await Sentry.close(2000);
}
