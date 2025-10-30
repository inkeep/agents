// cross-platform postinstall
import { execSync } from "node:child_process";

const isVercel = process.env.VERCEL === "1";
const skip = process.env.SKIP_APP_INSTALL === "1";

if (isVercel && !skip) {
	// Export the UI
	execSync("inkeep dev --export --output-dir ./apps/manage-ui", {
		stdio: "inherit",
		shell: true,
	});

	// Install dependencies in manage-ui with SKIP_APP_INSTALL flag
	execSync(
		"pnpm -C apps/manage-ui install --no-frozen-lockfile --ignore-scripts",
		{
			stdio: "inherit",
			shell: true,
			env: { ...process.env, SKIP_APP_INSTALL: "1" },
		},
	);
}
