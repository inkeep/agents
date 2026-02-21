import manifest from './slack-app-manifest.json' with { type: 'json' };

export const BOT_SCOPES: readonly string[] = manifest.oauth_config.scopes.bot;

export const BOT_SCOPES_CSV: string = BOT_SCOPES.join(',');
