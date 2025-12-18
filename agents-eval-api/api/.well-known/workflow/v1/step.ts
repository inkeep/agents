import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// Load the built handler that Vite build produces
const stepModule = require("../../../../dist/.well-known/workflow/v1/step.cjs");

export default async function handler(req: Request): Promise<Response> {
  return stepModule.default(req);
}
