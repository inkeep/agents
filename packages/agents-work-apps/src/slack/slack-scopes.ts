import manifest from './slack-app-manifest.json' with { type: 'json' };

const scopes = manifest?.oauth_config?.scopes?.bot;
if (!Array.isArray(scopes) || scopes.length === 0) {
  throw new Error(
    'slack-app-manifest.json is missing oauth_config.scopes.bot — check the manifest structure'
  );
}

export const BOT_SCOPES: readonly string[] = scopes;

export const BOT_SCOPES_CSV: string = BOT_SCOPES.join(',');
