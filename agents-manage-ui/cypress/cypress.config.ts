import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { defineConfig } from 'cypress';

try {
  process.loadEnvFile('../../.env');
} catch {
  // In CI, setup-dev generates .env and exports values to $GITHUB_ENV
}

export default defineConfig({
  experimentalFastVisibility: true,
  experimentalMemoryManagement: true,
  numTestsKeptInMemory: 0,
  defaultBrowser: 'chrome',
  waitForAnimations: false,
  retries: {
    runMode: 2,
    openMode: 0,
  },
  env: {
    TEST_USER_EMAIL: process.env.INKEEP_AGENTS_MANAGE_UI_USERNAME,
    TEST_USER_PASSWORD: process.env.INKEEP_AGENTS_MANAGE_UI_PASSWORD,
    BYPASS_SECRET: process.env.INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET,
    API_URL: process.env.INKEEP_AGENTS_API_URL || 'http://localhost:3002',
  },
  e2e: {
    video: true,
    baseUrl: `http://localhost:${process.env.MANAGE_UI_PORT || 3000}`,
    viewportWidth: 1_440,
    viewportHeight: 900,
    defaultCommandTimeout: 15_000,
    setupNodeEvents(on, _config) {
      on('task', {
        log(message: string) {
          console.log(message);
          return null;
        },
        solvePow(challenge: {
          algorithm: string;
          challenge: string;
          maxnumber: number;
          salt: string;
          signature: string;
        }): string {
          const algo = challenge.algorithm.replace('-', '').toLowerCase();
          for (let n = 0; n <= challenge.maxnumber; n++) {
            const hash = createHash(algo).update(`${challenge.salt}${n}`).digest('hex');
            if (hash === challenge.challenge) {
              return Buffer.from(
                JSON.stringify({
                  algorithm: challenge.algorithm,
                  challenge: challenge.challenge,
                  number: n,
                  salt: challenge.salt,
                  signature: challenge.signature,
                })
              ).toString('base64');
            }
          }
          throw new Error('PoW solve exhausted maxnumber');
        },
        async chatSSE(params: {
          url: string;
          headers: Record<string, string>;
          body: string;
        }): Promise<{ text: string; conversationId: string }> {
          const res = await fetch(params.url, {
            method: 'POST',
            headers: params.headers,
            body: params.body,
          });
          if (res.status !== 200) {
            const text = await res.text();
            throw new Error(`Chat failed (${res.status}): ${text.slice(0, 500)}`);
          }
          const raw = await res.text();
          let fullText = '';
          let convId = '';
          for (const line of raw.split('\n')) {
            if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
            try {
              const chunk = JSON.parse(line.slice(6));
              const delta = chunk.choices?.[0]?.delta;
              if (delta?.content) {
                if (delta.content.startsWith('{"type":"data-operation"')) {
                  try {
                    const op = JSON.parse(delta.content);
                    if (op.data?.details?.conversationId) convId = op.data.details.conversationId;
                  } catch {
                    /* ignore */
                  }
                } else {
                  fullText += delta.content;
                }
              }
              if (chunk.conversationId) convId = chunk.conversationId;
              if (chunk.id && !convId) convId = chunk.id;
              const dataOp = chunk.data ?? chunk;
              if (dataOp?.type === 'completion_complete' && dataOp?.details?.conversationId) {
                convId = dataOp.details.conversationId;
              }
            } catch {
              /* skip */
            }
          }
          if (!fullText) throw new Error(`Empty agent response. Raw: ${raw.slice(0, 500)}`);
          return { text: fullText, conversationId: convId };
        },
      });

      on('before:browser:launch', (browser, launchOptions) => {
        if (browser.family === 'chromium' && browser.isHeadless) {
          launchOptions.args.push(
            '--no-sandbox',
            '--disable-features=IsolateOrigins,site-per-process',
            '--disable-extensions',
            '--disable-translate',
            '--mute-audio'
          );
        }
        return launchOptions;
      });

      /**
       * Only keep failed videos
       * @see https://docs.cypress.io/app/guides/screenshots-and-videos#Delete-videos-for-specs-without-failing-or-retried-tests
       */
      on('after:spec', async (_spec, results) => {
        if (!results?.video) {
          return;
        }
        const failures = results.tests?.some((test) =>
          test.attempts?.some((attempt) => attempt.state === 'failed')
        );
        if (failures) {
          return;
        }
        await fs.rm(results.video, { force: true });
      });
    },
  },
});
