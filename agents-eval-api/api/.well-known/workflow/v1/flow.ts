import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// Load the built handler that Vite build produces
const flowModule = require("../../../../dist/.well-known/workflow/v1/flow.cjs");

export default async function handler(req: Request): Promise<Response> {
  return flowModule.default(req);
}
