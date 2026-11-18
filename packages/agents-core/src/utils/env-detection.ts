export function isDevelopment(): boolean {
  return process.env.ENVIRONMENT === 'development' || process.env.NODE_ENV === 'development';
}

export function isTest(): boolean {
  return process.env.ENVIRONMENT === 'test' || process.env.NODE_ENV === 'test';
}

export function isEnvironmentCredentialAccessEnabled(): boolean {
  return process.env.INKEEP_ENABLE_ENVIRONMENT_CREDENTIALS === 'true';
}

export function getTemplateEnvironmentVariables(): NodeJS.ProcessEnv {
  return isEnvironmentCredentialAccessEnabled() ? process.env : {};
}

export function isProduction(): boolean {
  return !isDevelopment() && !isTest();
}
