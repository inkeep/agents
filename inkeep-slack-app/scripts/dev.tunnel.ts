//scripts/dev.tunnel.ts
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import ngrok from "@ngrok/ngrok";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ path: ".env" });

const DEFAULT_PORT = 3000;
const MANIFEST_PATH = "manifest.json";
const MANIFEST_CONFIG_PATH = ".slack/config.json";
const TEMP_MANIFEST_PATH = ".slack/cache/manifest.temp.json";
const SLACK_EVENTS_PATH = "/api/slack/events";

const authtoken = process.env.NGROK_AUTH_TOKEN;
const domain = process.env.NGROK_DOMAIN; // Static domain from env

const getDevPort = async (): Promise<number> => {
  let port = DEFAULT_PORT;

  if (process.env.PORT) {
    const envPort = parseInt(process.env.PORT, 10);
    if (!Number.isNaN(envPort) && envPort > 0) {
      port = envPort;
    }
  }

  try {
    const packageJson = JSON.parse(await fs.readFile("package.json", "utf-8"));
    const devScript = packageJson.scripts?.dev;
    if (devScript) {
      const portMatch = devScript.match(/-p\s+(\d+)|--port\s+(\d+)/);
      if (portMatch) {
        const scriptPort = parseInt(portMatch[1] || portMatch[2], 10);
        if (!Number.isNaN(scriptPort) && scriptPort > 0) {
          port = scriptPort;
        }
      }
    }
  } catch {
    // Silently ignore package.json read errors
  }

  return port;
};

const isManifestConfigLocal = async (): Promise<boolean> => {
  try {
    const manifest = JSON.parse(await fs.readFile(MANIFEST_CONFIG_PATH, "utf-8"));
    return manifest?.manifest?.source === "local";
  } catch {
    // If config doesn't exist, assume local
    return true;
  }
};

const startNgrok = async (): Promise<ngrok.Listener> => {
  const port = await getDevPort();

  const config: ngrok.Config = {
    authtoken,
    addr: port,
  };

  // Use static domain if provided
  if (domain) {
    (config as any).domain = domain;
  }

  return await ngrok.connect(config);
};

const backupManifest = async (manifestContent: string): Promise<void> => {
  try {
    await fs.mkdir(".slack/cache", { recursive: true });
    await fs.writeFile(TEMP_MANIFEST_PATH, manifestContent);
  } catch (error) {
    throw new Error(
      `Failed to backup manifest: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

const removeTempManifest = async (): Promise<void> => {
  try {
    await fs.unlink(TEMP_MANIFEST_PATH);
  } catch {
    // Silently ignore if temp file doesn't exist
  }
};

const restoreManifest = async (): Promise<void> => {
  try {
    const manifest = await fs.readFile(TEMP_MANIFEST_PATH, "utf-8");
    await fs.writeFile(MANIFEST_PATH, manifest);
  } catch (error) {
    throw new Error(
      `Failed to restore manifest: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

interface ManifestUpdateResult {
  updated: boolean;
  originalContent: string;
}

interface SlackManifest {
  features: {
    slash_commands: Array<{ url: string }>;
  };
  settings: {
    event_subscriptions: { request_url: string };
    interactivity: { request_url: string };
  };
  oauth_config?: {
    redirect_urls?: string[];
  };
}

const updateManifestUrls = (manifest: SlackManifest, baseUrl: string): void => {
  const eventsUrl = `${baseUrl}${SLACK_EVENTS_PATH}`;

  // Update slash commands
  if (manifest.features?.slash_commands) {
    for (const cmd of manifest.features.slash_commands) {
      cmd.url = eventsUrl;
    }
  }

  // Update event subscriptions
  if (manifest.settings?.event_subscriptions) {
    manifest.settings.event_subscriptions.request_url = eventsUrl;
  }

  // Update interactivity
  if (manifest.settings?.interactivity) {
    manifest.settings.interactivity.request_url = eventsUrl;
  }

  // Update OAuth redirect URLs
  if (manifest.oauth_config?.redirect_urls) {
    manifest.oauth_config.redirect_urls = manifest.oauth_config.redirect_urls.map(url => {
      if (url.includes("<your-domain>") || url.includes("localhost")) {
        return `${baseUrl}/api/slack/oauth/callback`;
      }
      return url;
    });
  }
};

const updateManifest = async (
  url: string | null,
): Promise<ManifestUpdateResult> => {
  if (!url) return { updated: false, originalContent: "" };

  try {
    const file = await fs.readFile(MANIFEST_PATH, "utf-8");
    const manifest: SlackManifest = JSON.parse(file);

    const newUrl = `${url}${SLACK_EVENTS_PATH}`;
    const currentUrl = manifest.settings?.event_subscriptions?.request_url;

    // Skip if URL hasn't changed
    if (currentUrl === newUrl) {
      return { updated: false, originalContent: "" };
    }

    updateManifestUrls(manifest, url);

    await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
    return { updated: true, originalContent: file };
  } catch (error) {
    throw new Error(
      `Failed to update manifest: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

const cleanup = async (
  client: ngrok.Listener | null,
  manifestWasUpdated: boolean,
) => {
  if (client) {
    await client.close();
  }
  if (manifestWasUpdated) {
    await restoreManifest();
    await removeTempManifest();
  }
};

const runDevCommand = () => {
  return spawn("pnpm", ["dev"], { stdio: "inherit" });
};

const main = async () => {
  let client: ngrok.Listener | null = null;
  let manifestWasUpdated = false;
  let isCleaningUp = false;

  const handleExit = async () => {
    if (isCleaningUp) return;
    isCleaningUp = true;
    await cleanup(client, manifestWasUpdated);
    process.exit(0);
  };

  process.on("SIGINT", handleExit);
  process.on("SIGTERM", handleExit);

  try {
    client = await startNgrok();
    const tunnelUrl = client.url();

    const { updated, originalContent } = await updateManifest(tunnelUrl);
    manifestWasUpdated = updated;

    if (manifestWasUpdated) {
      await backupManifest(originalContent);
    }

    console.log("\n");
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("  🚀 ngrok tunnel established!");
    console.log("═══════════════════════════════════════════════════════════════");
    console.log(`  URL: \x1b[36m${tunnelUrl}\x1b[0m`);
    if (domain) {
      console.log(`  (using static domain: ${domain})`);
    }
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("\n  Slack webhook URL:");
    console.log(`  \x1b[36m${tunnelUrl}/api/slack/events\x1b[0m\n`);

    const devProcess = runDevCommand();

    await new Promise<void>((resolve) => {
      devProcess.on("exit", () => {
        resolve();
      });
    });
  } catch (error) {
    if (error instanceof Error) {
      console.error("Error starting ngrok tunnel:", error.message);
    } else {
      console.error("Error starting ngrok tunnel:", error);
    }
  } finally {
    if (!isCleaningUp) {
      await cleanup(client, manifestWasUpdated);
    }
  }
};

const runDevWithExit = () => {
  const devProcess = runDevCommand();

  const handleExit = () => {
    if (devProcess) {
      devProcess.kill("SIGINT");
    }
    process.exit(0);
  };

  process.on("SIGINT", handleExit);
  process.on("SIGTERM", handleExit);
};

(async () => {
  const manifestIsLocal = await isManifestConfigLocal();

  if (manifestIsLocal && authtoken) {
    main();
  } else if (manifestIsLocal && !authtoken) {
    console.warn(
      "\x1b[33m\x1b[3m%s\x1b[0m",
      "⚠  Manifest is set to local in .slack/config.json but NGROK_AUTH_TOKEN is missing. Webhook events will not be sent to your local server.",
    );
    runDevWithExit();
  } else {
    console.warn(
      "\x1b[33m\x1b[3m%s\x1b[0m",
      "⚠  Manifest is set to remote in .slack/config.json. Webhook events will not be sent to your local server.",
    );
    runDevWithExit();
  }
})();