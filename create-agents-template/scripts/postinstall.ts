// cross-platform postinstall
import { execSync } from 'node:child_process';

const isVercel = process.env.VERCEL === '1';
// Opt-in guard: only export the Inkeep UI when a Vercel deploy of THIS template
// has explicitly opted in via CHAT_TO_EDIT-style INKEEP_QUICKSTART_EXPORT=1.
// The apps/agents-api/vercel.json installCommand sets it.
//
// Why: this postinstall runs on every `pnpm install` at template root. Gating
// on `VERCEL === '1'` alone fires it during any Vercel build in the template
// (now or future — e.g. if a customer adds a second Vercel project targeting
// apps/mcp), which tries to run the `inkeep` CLI (may not be installed in
// a devDep-skipping production install) and crashes the build.
// Mirrors the fix shipped in PR #137 for private/chat-to-edit.
const shouldExport = process.env.INKEEP_QUICKSTART_EXPORT === '1';
const skip = process.env.SKIP_APP_INSTALL === '1';

if (isVercel && shouldExport && !skip) {
  // Export the UI
  execSync('inkeep dev --export --output-dir ./apps/manage-ui', {
    stdio: 'inherit',
  });

  // Install dependencies in manage-ui with SKIP_APP_INSTALL flag
  execSync('pnpm -C apps/manage-ui install --no-frozen-lockfile --ignore-scripts', {
    stdio: 'inherit',
    env: { ...process.env, SKIP_APP_INSTALL: '1' },
  });
}
